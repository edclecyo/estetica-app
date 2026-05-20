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
        console.error('❌ MP_ACCESS_TOKEN AUSENTE');
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
        console.log('❌ ID NÃO ENVIADO', {
          body: req.body,
          query: req.query,
        });

        res.sendStatus(200);
        return;
      }

      console.log('📩 WEBHOOK RECEBIDO:', {
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
            console.warn('⚠️ assinatura inválida, mas continuando');
          }
        } catch (e) {
          console.warn('⚠️ erro assinatura:', e);
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
        console.log('❌ PAGAMENTO INVÁLIDO:', mpData);
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

      console.log('💳 PAGAMENTO MP:', {
        paymentId,
        paymentType,
        status,
        external_reference: mpData.external_reference,
      });

      // =====================================================
      // 🔵 PIX / BANK TRANSFER
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

          if (pagamentoData?.tipo === 'impulsionamento') {
            if (!isApproved) {
              await pagamentoRef.update({
                status,
                atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
              });

              console.log('⚠️ IMPULSIONAMENTO STATUS:', status);
              res.sendStatus(200);
              return;
            }

            const estabelecimentoId = pagamentoData.estabelecimentoId;

            if (!estabelecimentoId) {
              console.log('❌ IMPULSIONAMENTO SEM ESTABELECIMENTO');
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

            console.log('⭐ IMPULSIONAMENTO ATIVADO:', estabelecimentoId);

            res.sendStatus(200);
            return;
          }
        }

        const snap = await db
          .collection('estabelecimentos')
          .where('pixPagamentoId', '==', paymentId)
          .limit(1)
          .get();

        console.log('📄 PIX ASSINATURA DOCS ENCONTRADOS:', snap.size);

        if (snap.empty) {
          console.log('⚠️ PIX NÃO ENCONTRADO:', paymentId);
          res.sendStatus(200);
          return;
        }

        const ref = snap.docs[0].ref;
        const data = snap.docs[0].data() as any;

        if (
          data?.webhookProcessedPix === paymentId &&
          data?.paymentStatus === 'approved'
        ) {
          console.log('⚠️ PIX DUPLICADO IGNORADO:', paymentId);
          res.sendStatus(200);
          return;
        }

        if (isApproved) {
          const planoFinal = data?.planoPendente ?? data?.plano;
          const elite = isElite(planoFinal);

          const iaAtiva =
            data?.iaSimulacaoPendente === true &&
            elite;

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

            iaSimulacaoAtiva: iaAtiva,
            iaSimulacaoLimiteMensal: iaAtiva ? 2 : 0,
            iaSimulacaoPacote: iaAtiva ? 'elite_ia_2' : null,
            iaSimulacaoValor: iaAtiva ? 19.9 : 0,
            iaSimulacaoPendente: admin.firestore.FieldValue.delete(),

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

          console.log('✅ PIX ASSINATURA APROVADO:', paymentId);
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

          console.log('⚠️ PIX ASSINATURA STATUS:', status);
        }

        res.sendStatus(200);
        return;
      }

      // =====================================================
      // 🟡 CARTÃO ASSINATURA
      // =====================================================

      if (paymentType === 'credit_card') {
        const estabelecimentoId = String(
          mpData.external_reference || ''
        ).trim();

        if (!estabelecimentoId) {
          console.log('❌ external_reference AUSENTE');
          res.sendStatus(200);
          return;
        }

        const ref = db
          .collection('estabelecimentos')
          .doc(estabelecimentoId);

        const snap = await ref.get();

        if (!snap.exists) {
          console.log('❌ estabelecimento NÃO EXISTE:', estabelecimentoId);
          res.sendStatus(200);
          return;
        }

        const data = snap.data() as any;

        if (
          data?.pagamentoId === paymentId &&
          data?.paymentStatus === 'approved'
        ) {
          console.log('⚠️ CARTÃO DUPLICADO IGNORADO:', paymentId);
          res.sendStatus(200);
          return;
        }

        if (isApproved) {
          const planoFinal = data?.planoPendente ?? data?.plano;
          const elite = isElite(planoFinal);

          const iaAtiva =
            data?.iaSimulacaoPendente === true &&
            elite;

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

            iaSimulacaoAtiva: iaAtiva,
            iaSimulacaoLimiteMensal: iaAtiva ? 2 : 0,
            iaSimulacaoPacote: iaAtiva ? 'elite_ia_2' : null,
            iaSimulacaoValor: iaAtiva ? 19.9 : 0,
            iaSimulacaoPendente: admin.firestore.FieldValue.delete(),

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

          console.log('✅ CARTÃO APROVADO:', paymentId);
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

          console.log('⚠️ CARTÃO STATUS:', status);
        }

        res.sendStatus(200);
        return;
      }

      console.log('⚠️ PAYMENT TYPE NÃO TRATADO:', paymentType);
      res.sendStatus(200);
    } catch (error: any) {
      console.error(
        '🔥 WEBHOOK ERROR:',
        error?.response?.data || error
      );

      res.sendStatus(200);
    }
  }
);