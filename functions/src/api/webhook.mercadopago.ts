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

function getIAPlanoConfig(plano: any) {
  const id = String(plano || '').toLowerCase().trim();

  if (id === 'pro') {
    return {
      valor: 19.99,
      limiteMensal: 20,
      pacote: 'pro_ia_20',
    };
  }

  if (id === 'elite') {
    return {
      valor: 14.90,
      limiteMensal: 100,
      pacote: 'elite_ia_100',
    };
  }

  return null;
}

function getIACreditoPacote(pacote: any) {
  const id = String(pacote || '1').toLowerCase().trim();

  if (id === '1' || id === 'unitario') {
    return {
      id: '1',
      creditos: 1,
      valor: 2.99,
    };
  }

  if (id === '10') {
    return {
      id: '10',
      creditos: 10,
      valor: 29.90,
    };
  }

  if (id === '50') {
    return {
      id: '50',
      creditos: 50,
      valor: 149.50,
    };
  }

  if (id === '100') {
    return {
      id: '100',
      creditos: 100,
      valor: 299.00,
    };
  }

  return null;
}

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
            console.warn('⚠️ assinatura inválida, consultando pagamento na API MP');
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

              console.log('⚠️ SELO STATUS:', status);
              res.sendStatus(200);
              return;
            }

            const {
              solicitacaoId,
              estabelecimentoId,
            } = pagamentoData;

            if (!solicitacaoId || !estabelecimentoId) {
              console.log('❌ SELO SEM REFERENCIAS');
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

            console.log('✅ SELO ATIVADO:', estabelecimentoId);
            res.sendStatus(200);
            return;
          }

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

            console.log('⭐ IMPULSIONAMENTO ATIVADO:', estabelecimentoId);

            res.sendStatus(200);
            return;
          }

          if (pagamentoData?.tipo === 'ia_simulacao') {
            const estabelecimentoId = pagamentoData.estabelecimentoId;

            if (!estabelecimentoId) {
              console.log('IA SEM ESTABELECIMENTO');
              res.sendStatus(200);
              return;
            }

            if (!isApproved) {
              await pagamentoRef.update({
                status,
                atualizadoEm:
                  admin.firestore.FieldValue.serverTimestamp(),
              });

              await db
                .collection('estabelecimentos')
                .doc(estabelecimentoId)
                .update({
                  iaSimulacaoPaymentStatus: status,
                  atualizadoEm:
                    admin.firestore.FieldValue.serverTimestamp(),
                });

              console.log('IA STATUS:', status);
              res.sendStatus(200);
              return;
            }

            const iaConfig = getIAPlanoConfig(pagamentoData.plano);
            const dias = Number(pagamentoData.dias || 30);
            const limiteMensal = Number(
              pagamentoData.limiteMensal ||
              iaConfig?.limiteMensal ||
              0
            );
            const expira = new Date();
            expira.setDate(expira.getDate() + dias);

            await db
              .collection('estabelecimentos')
              .doc(estabelecimentoId)
              .update({
                iaSimulacaoAtiva: true,
                iaSimulacaoLimiteMensal: limiteMensal,
                iaSimulacaoPacote:
                  pagamentoData.pacote ||
                  iaConfig?.pacote ||
                  null,
                iaSimulacaoValor: Number(
                  pagamentoData.valor ||
                  iaConfig?.valor ||
                  0
                ),
                iaSimulacaoAtivadoEm:
                  admin.firestore.FieldValue.serverTimestamp(),
                iaSimulacaoExpiraEm:
                  admin.firestore.Timestamp.fromDate(expira),
                iaSimulacaoPaymentStatus: 'approved',
                iaSimulacaoPagamentoPendente:
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

            console.log('IA ATIVADA:', estabelecimentoId);
            res.sendStatus(200);
            return;
          }

          if (pagamentoData?.tipo === 'ia_creditos') {
  const estabelecimentoId =
    pagamentoData.estabelecimentoId;

  if (!estabelecimentoId) {
    console.log(
      'CREDITOS IA SEM ESTABELECIMENTO'
    );

    res.sendStatus(200);
    return;
  }

  const pacote = getIACreditoPacote(
    pagamentoData.pacote
  );

  const creditos = Number(
    pagamentoData.creditos ||
    pacote?.creditos ||
    0
  );

  // ============================================
  // PAGAMENTO AINDA NÃO APROVADO
  // ============================================

  if (!isApproved) {
    await pagamentoRef.update({
      status,

      atualizadoEm:
        admin.firestore.FieldValue.serverTimestamp(),
    });

    await db
      .collection('estabelecimentos')
      .doc(estabelecimentoId)
      .update({
        iaCreditosPaymentStatus: status,

        atualizadoEm:
          admin.firestore.FieldValue.serverTimestamp(),
      });

    console.log(
      'CREDITOS IA STATUS:',
      status
    );

    res.sendStatus(200);
    return;
  }

  // ============================================
  // VALIDA QUANTIDADE
  // ============================================

  if (creditos <= 0) {
    console.log(
      'CREDITOS IA INVALIDO:',
      pagamentoData
    );

    res.sendStatus(200);
    return;
  }

  const estRef = db
    .collection('estabelecimentos')
    .doc(estabelecimentoId);

  // ============================================
  // TRANSAÇÃO
  // Evita liberar o mesmo pagamento 2x
  // ============================================

  await db.runTransaction(async transaction => {
    const pagamentoAtualSnap =
      await transaction.get(pagamentoRef);

    if (!pagamentoAtualSnap.exists) {
      throw new Error(
        'Pagamento de créditos IA não encontrado.'
      );
    }

    const pagamentoAtual =
      pagamentoAtualSnap.data() as any;

    // ============================================
    // JÁ FOI LIBERADO?
    // ============================================

    if (
      pagamentoAtual.creditosLiberados === true
    ) {
      console.log(
        'CREDITOS IA JA LIBERADOS:',
        paymentId
      );

      return;
    }

    // ============================================
    // LIBERA OS CRÉDITOS
    // ============================================

    transaction.update(estRef, {
      iaCreditosDisponiveis:
        admin.firestore.FieldValue.increment(
          creditos
        ),

      iaCreditosComprados:
        admin.firestore.FieldValue.increment(
          creditos
        ),

      iaUltimoPacoteCreditos:
        pagamentoAtual.pacote ||
        pacote?.id ||
        null,

      iaUltimoPagamentoCreditosId:
        paymentId,

      iaCreditosPaymentStatus:
        'approved',

      iaCreditosPagamentoPendente:
        admin.firestore.FieldValue.delete(),

      atualizadoEm:
        admin.firestore.FieldValue.serverTimestamp(),
    });

    // ============================================
    // MARCA PAGAMENTO COMO PROCESSADO
    // ============================================

    transaction.update(pagamentoRef, {
      status: 'approved',

      creditosLiberados: true,

      quantidadeCreditosLiberados:
        creditos,

      aprovadoEm:
        admin.firestore.FieldValue.serverTimestamp(),

      creditosLiberadosEm:
        admin.firestore.FieldValue.serverTimestamp(),

      atualizadoEm:
        admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  console.log(
    'CREDITOS IA APROVADOS:',
    {
      estabelecimentoId,
      creditos,
      paymentId,
    }
  );

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
          const iaConfig = getIAPlanoConfig(planoFinal);

          const iaAtiva =
            data?.iaSimulacaoPendente === true && !!iaConfig;

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

            iaSimulacaoAtiva:
              iaAtiva ? true : data?.iaSimulacaoAtiva === true,
            iaSimulacaoLimiteMensal:
              iaAtiva ? iaConfig!.limiteMensal : Number(data?.iaSimulacaoLimiteMensal || 0),
            iaSimulacaoPacote:
              iaAtiva ? iaConfig!.pacote : data?.iaSimulacaoPacote || null,
            iaSimulacaoValor:
              iaAtiva ? iaConfig!.valor : Number(data?.iaSimulacaoValor || 0),
            iaSimulacaoExpiraEm:
              iaAtiva
                ? admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                  )
                : data?.iaSimulacaoExpiraEm || null,
            iaSimulacaoAtivadoEm:
              iaAtiva
                ? admin.firestore.FieldValue.serverTimestamp()
                : data?.iaSimulacaoAtivadoEm || null,
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
          const iaConfig = getIAPlanoConfig(planoFinal);

          const iaAtiva =
            data?.iaSimulacaoPendente === true && !!iaConfig;

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

            iaSimulacaoAtiva:
              iaAtiva ? true : data?.iaSimulacaoAtiva === true,
            iaSimulacaoLimiteMensal:
              iaAtiva ? iaConfig!.limiteMensal : Number(data?.iaSimulacaoLimiteMensal || 0),
            iaSimulacaoPacote:
              iaAtiva ? iaConfig!.pacote : data?.iaSimulacaoPacote || null,
            iaSimulacaoValor:
              iaAtiva ? iaConfig!.valor : Number(data?.iaSimulacaoValor || 0),
            iaSimulacaoExpiraEm:
              iaAtiva
                ? admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                  )
                : data?.iaSimulacaoExpiraEm || null,
            iaSimulacaoAtivadoEm:
              iaAtiva
                ? admin.firestore.FieldValue.serverTimestamp()
                : data?.iaSimulacaoAtivadoEm || null,
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
