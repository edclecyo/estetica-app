import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';

import { db } from '../config/firebase';
import { REGION } from '../config/region';
import { validarAssinaturaMercadoPago } from '../utils/security';

import { defineSecret } from 'firebase-functions/params';

const MP_WEBHOOK_SECRET = defineSecret('MP_WEBHOOK_SECRET');
const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN');

type MercadoPagoPayment = {
  id: string | number;
  status: string;
  payment_type_id?: string;
  external_reference?: string;
  status_detail?: string;
};

const isElite = (plano: any) =>
  String(plano || '').toLowerCase() === 'elite';


export const webhookMercadoPago = onRequest(
  {
    region: REGION,
    secrets: [MP_WEBHOOK_SECRET, MP_ACCESS_TOKEN],
  },

  async (req, res): Promise<void> => {
    try {
      const segredoWebhook = MP_WEBHOOK_SECRET.value();
      const accessToken = MP_ACCESS_TOKEN.value()?.trim();

      if (!accessToken) {
        console.error('âŒ MP_ACCESS_TOKEN AUSENTE');
        res.sendStatus(200);
        return;
      }

      const rawId =
        req.body?.data?.id ||
        req.body?.id ||
        req.query?.['data.id'] ||
        req.query?.id ||
        '';

      const id = String(rawId).trim();

      if (!id) {
        console.log('âŒ ID NÃƒO ENVIADO', {
          body: req.body,
          query: req.query,
        });

        res.sendStatus(200);
        return;
      }

      console.log('ðŸ“© WEBHOOK RECEBIDO:', {
        id,
        body: req.body,
        query: req.query,
      });

      if (segredoWebhook) {
        try {
          const signature = Array.isArray(req.headers['x-signature'])
            ? req.headers['x-signature'][0]
            : req.headers['x-signature'];

          const requestId = Array.isArray(req.headers['x-request-id'])
            ? req.headers['x-request-id'][0]
            : req.headers['x-request-id'];

          const ok = validarAssinaturaMercadoPago(
            signature,
            requestId,
            id,
            segredoWebhook
          );

          if (!ok) {
            console.warn('âš ï¸ assinatura invÃ¡lida, consultando pagamento na API MP');
          }
        } catch (e) {
          console.warn('âš ï¸ erro assinatura:', e);
        }
      }

      const resp = await axios.get<MercadoPagoPayment>(
        `https://api.mercadopago.com/v1/payments/${id}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const mpData = resp.data;

      if (!mpData?.status || !mpData?.id) {
        console.log('âŒ PAGAMENTO INVÃLIDO:', mpData);
        res.sendStatus(200);
        return;
      }

      const paymentId = String(mpData.id).trim();
      const paymentType = mpData.payment_type_id;
      const status = mpData.status;

      const isApproved =
        status === 'approved' ||
        status === 'authorized' ||
        status === 'accredited';

      console.log('ðŸ’³ PAGAMENTO MP:', {
        paymentId,
        paymentType,
        status,
        external_reference: mpData.external_reference,
      });

      // =====================================================
      // ðŸ”µ PIX / BANK TRANSFER
      // =====================================================

      if (paymentType === 'pix' || paymentType === 'bank_transfer') {
        const pagamentoSnap = await db
          .collection('pagamentos')
          .where('mercadoPagoId', '==', paymentId)
          .limit(1)
          .get();

        if (!pagamentoSnap.empty) {
          const pagamentoRef = pagamentoSnap.docs[0].ref;
          const pagamentoData = pagamentoSnap.docs[0].data() as any;

          if (pagamentoData?.tipo === 'selo') {
            if (!isApproved) {
              await pagamentoRef.update({
                status,
                atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
              });

              if (pagamentoData.solicitacaoId) {
                await db
                  .collection('solicitacoesVerificacao')
                  .doc(pagamentoData.solicitacaoId)
                  .update({
                    pagamentoStatus: status,
                    atualizadoEm:
                      admin.firestore.FieldValue.serverTimestamp(),
                  });
              }

              console.log('âš ï¸ SELO STATUS:', status);
              res.sendStatus(200);
              return;
            }

            const {
              solicitacaoId,
              estabelecimentoId,
            } = pagamentoData;

            if (!solicitacaoId || !estabelecimentoId) {
              console.log('âŒ SELO SEM REFERENCIAS');
              res.sendStatus(200);
              return;
            }

            const batch = db.batch();

            batch.update(
              db.collection('solicitacoesVerificacao').doc(solicitacaoId),
              {
                pago: true,
                pagamentoStatus: 'approved',
                pagoEm: admin.firestore.FieldValue.serverTimestamp(),
                atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
              }
            );

            batch.update(
              db.collection('estabelecimentos').doc(estabelecimentoId),
              {
                verificado: true,
                verificadoManual: true,
                verificadoAutomatico: false,
                verificadoEm: admin.firestore.FieldValue.serverTimestamp(),
                seloTaxaPaga: true,
                solicitacaoSeloStatus: 'pago',
                atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
              }
            );

            batch.update(pagamentoRef, {
              status: 'approved',
              aprovadoEm:
                admin.firestore.FieldValue.serverTimestamp(),
              atualizadoEm:
                admin.firestore.FieldValue.serverTimestamp(),
            });

            await batch.commit();

            console.log('âœ… SELO ATIVADO:', estabelecimentoId);
            res.sendStatus(200);
            return;
          }

          if (pagamentoData?.tipo === 'impulsionamento') {
            if (!isApproved) {
              await pagamentoRef.update({
                status,
                atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
              });

              console.log('âš ï¸ IMPULSIONAMENTO STATUS:', status);
              res.sendStatus(200);
              return;
            }

            const estabelecimentoId = pagamentoData.estabelecimentoId;

            if (!estabelecimentoId) {
              console.log('âŒ IMPULSIONAMENTO SEM ESTABELECIMENTO');
              res.sendStatus(200);
              return;
            }

            const dias = Number(pagamentoData.dias || 7);

            const expira = new Date();
            expira.setDate(expira.getDate() + dias);

            await db
              .collection('estabelecimentos')
              .doc(estabelecimentoId)
              .update({
                destaqueAtivo: true,
                destaqueOrigem: 'impulsionamento',
                destaqueEm: admin.firestore.FieldValue.serverTimestamp(),
                destaqueExpira: admin.firestore.Timestamp.fromDate(expira),
                destaquePacoteId: pagamentoData.pacoteId || null,
                destaquePacoteNome: pagamentoData.pacoteNome || null,
                destaquePacoteDias: dias,
                destaqueAvisoVencimentoEm:
                  admin.firestore.FieldValue.delete(),
                destaqueAvisoVencimentoExpiraEm:
                  admin.firestore.FieldValue.delete(),

                impulsionamentoPendente:
                  admin.firestore.FieldValue.delete(),

                atualizadoEm:
                  admin.firestore.FieldValue.serverTimestamp(),
              });

            await pagamentoRef.update({
              status: 'approved',
              aprovadoEm:
                admin.firestore.FieldValue.serverTimestamp(),
              atualizadoEm:
                admin.firestore.FieldValue.serverTimestamp(),
            });

            console.log('â­ IMPULSIONAMENTO ATIVADO:', estabelecimentoId);

            res.sendStatus(200);
            return;
          }


          if (
            pagamentoData?.tipo === 'agendamento' ||
            pagamentoData?.tipo === 'sinal_agendamento'
          ) {
            const agendamentoId = String(
              pagamentoData.agendamentoId ||
              mpData.external_reference ||
              ''
            ).trim();

            await pagamentoRef.update({
              status: isApproved ? 'approved' : status,
              aprovadoEm: isApproved
                ? admin.firestore.FieldValue.serverTimestamp()
                : admin.firestore.FieldValue.delete(),
              atualizadoEm:
                admin.firestore.FieldValue.serverTimestamp(),
            });

            if (!agendamentoId) {
              console.log('AGENDAMENTO SEM REFERENCIA:', paymentId);
              res.sendStatus(200);
              return;
            }

            const agRef = db
              .collection('agendamentos')
              .doc(agendamentoId);

            const agSnap = await agRef.get();

            if (!agSnap.exists) {
              console.log('AGENDAMENTO NAO ENCONTRADO:', agendamentoId);
              res.sendStatus(200);
              return;
            }

            const ag = agSnap.data() as any;

            if (isApproved) {
              if (
                ag?.webhookProcessedPix === paymentId &&
                ag?.statusPagamento === 'approved'
              ) {
                console.log('AGENDAMENTO PIX DUPLICADO:', paymentId);
                res.sendStatus(200);
                return;
              }

              await agRef.update({
                status: 'confirmado',
                statusPagamento: 'approved',
                pixStatus: 'approved',
                pagamentoAprovadoId: paymentId,
                webhookProcessedPix: paymentId,
                reservaTemporaria: false,
                pagamentoExpiraEm:
                  admin.firestore.FieldValue.delete(),
                pagamentoConfirmadoEm:
                  admin.firestore.FieldValue.serverTimestamp(),
                atualizadoEm:
                  admin.firestore.FieldValue.serverTimestamp(),
              });

              await db.collection('notificacoes').add({
                tipo: 'cliente',
                type: 'PAGAMENTO_CONFIRMADO',
                clienteId: ag.clienteUid,
                userId: ag.clienteUid,
                adminId: ag.adminId,
                agendamentoId,
                estabelecimentoId: ag.estabelecimentoId || '',
                estabelecimentoNome: ag.estabelecimentoNome || '',
                clienteNome: ag.clienteNome || '',
                servicoNome: ag.servicoNome || '',
                formaPagamento: ag.formaPagamento || '',
                titulo: ag.formaPagamento === 'sinal'
                  ? 'Sinal confirmado'
                  : 'Pagamento confirmado',
                mensagem: ag.formaPagamento === 'sinal'
                  ? `Seu sinal de 50% foi confirmado e seu horario de ${ag.servicoNome || 'servico'} esta liberado. O restante deve ser pago no dia do atendimento.`
                  : `Seu pagamento foi confirmado e seu horario de ${ag.servicoNome || 'servico'} esta liberado.`,
                lida: false,
                apagada: false,
                criadoEm: admin.firestore.FieldValue.serverTimestamp(),
              });

              console.log('AGENDAMENTO PIX APROVADO:', agendamentoId);
            } else {
              await agRef.update({
                statusPagamento: status || 'pending',
                pixStatus: status || 'pending',
                atualizadoEm:
                  admin.firestore.FieldValue.serverTimestamp(),
              });

              console.log('AGENDAMENTO PIX STATUS:', {
                agendamentoId,
                status,
              });
            }

            res.sendStatus(200);
            return;
          }
        }

        const snap = await db
          .collection('estabelecimentos')
          .where('pixPagamentoId', '==', paymentId)
          .limit(1)
          .get();

        console.log('ðŸ“„ PIX ASSINATURA DOCS ENCONTRADOS:', snap.size);

        if (snap.empty) {
          console.log('âš ï¸ PIX NÃƒO ENCONTRADO:', paymentId);
          res.sendStatus(200);
          return;
        }

        const ref = snap.docs[0].ref;
        const data = snap.docs[0].data() as any;

        if (
          data?.webhookProcessedPix === paymentId &&
          data?.paymentStatus === 'approved'
        ) {
          console.log('âš ï¸ PIX DUPLICADO IGNORADO:', paymentId);
          res.sendStatus(200);
          return;
        }

        if (isApproved) {
          const planoFinal = data?.planoPendente ?? data?.plano;
          const elite = isElite(planoFinal);

          await ref.update({
            plano: planoFinal,
            planoAprovado: planoFinal,
            planoPendente: admin.firestore.FieldValue.delete(),

            assinaturaAtiva: true,
            statusPlano: 'ativo',

            verificado: elite ? true : data?.verificadoManual === true,
            verificadoAutomatico: elite,
            verificadoEm: elite
              ? admin.firestore.FieldValue.serverTimestamp()
              : null,

            destaqueBasicoAtivo: elite,
            destaqueBasicoOrigem: elite ? 'plano_elite' : null,

            paymentStatus: 'approved',
            paymentType: 'pix',

            pixStatus: 'approved',
            pixPagamentoId: paymentId,
            pixProcessado: paymentId,
            webhookProcessedPix: paymentId,
            pagamentoAprovadoId: paymentId,

            expiraEm: admin.firestore.Timestamp.fromDate(
              new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            ),

            atualizadoEm:
              admin.firestore.FieldValue.serverTimestamp(),
          });

          if (!pagamentoSnap.empty) {
            await pagamentoSnap.docs[0].ref.update({
              status: 'approved',
              aprovadoEm:
                admin.firestore.FieldValue.serverTimestamp(),
              atualizadoEm:
                admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          console.log('âœ… PIX ASSINATURA APROVADO:', paymentId);
        } else {
          await ref.update({
            pixStatus: status,
            paymentStatus: status,
            paymentType: 'pix',
            atualizadoEm:
              admin.firestore.FieldValue.serverTimestamp(),
          });

          if (!pagamentoSnap.empty) {
            await pagamentoSnap.docs[0].ref.update({
              status,
              atualizadoEm:
                admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          console.log('âš ï¸ PIX ASSINATURA STATUS:', status);
        }

        res.sendStatus(200);
        return;
      }

      // =====================================================
      // ðŸŸ¡ CARTÃƒO ASSINATURA
      // =====================================================

      if (paymentType === 'credit_card') {
        const estabelecimentoId = String(
          mpData.external_reference || ''
        ).trim();

        if (!estabelecimentoId) {
          console.log('âŒ external_reference AUSENTE');
          res.sendStatus(200);
          return;
        }

        const ref = db
          .collection('estabelecimentos')
          .doc(estabelecimentoId);

        const snap = await ref.get();

        if (!snap.exists) {
          console.log('âŒ estabelecimento NÃƒO EXISTE:', estabelecimentoId);
          res.sendStatus(200);
          return;
        }

        const data = snap.data() as any;

        if (
          data?.pagamentoId === paymentId &&
          data?.paymentStatus === 'approved'
        ) {
          console.log('âš ï¸ CARTÃƒO DUPLICADO IGNORADO:', paymentId);
          res.sendStatus(200);
          return;
        }

        if (isApproved) {
          const planoFinal = data?.planoPendente ?? data?.plano;
          const elite = isElite(planoFinal);

          await ref.update({
            plano: planoFinal,
            planoAprovado: planoFinal,
            planoPendente: admin.firestore.FieldValue.delete(),

            assinaturaAtiva: true,
            statusPlano: 'ativo',

            verificado: elite ? true : data?.verificadoManual === true,
            verificadoAutomatico: elite,
            verificadoEm: elite
              ? admin.firestore.FieldValue.serverTimestamp()
              : null,

            destaqueBasicoAtivo: elite,
            destaqueBasicoOrigem: elite ? 'plano_elite' : null,

            paymentStatus: 'approved',
            paymentType: 'credit_card',

            pagamentoId: paymentId,
            pagamentoAprovadoId: paymentId,

            statusDetail: mpData.status_detail || null,

            expiraEm: admin.firestore.Timestamp.fromDate(
              new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            ),

            atualizadoEm:
              admin.firestore.FieldValue.serverTimestamp(),
          });

          const pagamentoSnap = await db
            .collection('pagamentos')
            .where('mercadoPagoId', '==', paymentId)
            .limit(1)
            .get();

          if (!pagamentoSnap.empty) {
            await pagamentoSnap.docs[0].ref.update({
              status: 'approved',
              aprovadoEm:
                admin.firestore.FieldValue.serverTimestamp(),
              atualizadoEm:
                admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          console.log('âœ… CARTÃƒO APROVADO:', paymentId);
        } else {
          await ref.update({
            paymentStatus: status,
            paymentType: 'credit_card',
            pagamentoId: paymentId,
            statusDetail: mpData.status_detail || null,
            atualizadoEm:
              admin.firestore.FieldValue.serverTimestamp(),
          });

          const pagamentoSnap = await db
            .collection('pagamentos')
            .where('mercadoPagoId', '==', paymentId)
            .limit(1)
            .get();

          if (!pagamentoSnap.empty) {
            await pagamentoSnap.docs[0].ref.update({
              status,
              atualizadoEm:
                admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          console.log('âš ï¸ CARTÃƒO STATUS:', status);
        }

        res.sendStatus(200);
        return;
      }

      console.log('âš ï¸ PAYMENT TYPE NÃƒO TRATADO:', paymentType);
      res.sendStatus(200);
    } catch (error: any) {
      console.error(
        'ðŸ”¥ WEBHOOK ERROR:',
        error?.response?.data || error
      );

      res.sendStatus(200);
    }
  }
);
