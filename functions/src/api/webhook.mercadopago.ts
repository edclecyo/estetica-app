import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';

import { db } from '../config/firebase';
import { REGION } from '../config/region';
import { validarAssinaturaMercadoPago } from '../utils/security';
import { defineSecret } from 'firebase-functions/params';

// ─────────────────────────────────────────────
// SECRETS
// ─────────────────────────────────────────────
const MP_WEBHOOK_SECRET = defineSecret('MP_WEBHOOK_SECRET');
const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN');

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
type MercadoPagoPayment = {
  id: string;
  status: string;
  payment_type_id?: string;
  external_reference?: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
    };
  };
};

// ─────────────────────────────────────────────
// WEBHOOK
// ─────────────────────────────────────────────
export const webhookMercadoPago = onRequest(
  {
    region: REGION,
    secrets: [MP_WEBHOOK_SECRET, MP_ACCESS_TOKEN],
  },
  async (req, res): Promise<void> => {
    try {
      const segredoWebhook = MP_WEBHOOK_SECRET.value();
      const accessToken = MP_ACCESS_TOKEN.value();

      // 🔥 ID FLEXÍVEL
      const id: string =
        req.body?.data?.id ||
        req.body?.id;

      if (!id) {
        res.sendStatus(200);
        return;
      }

      // ─────────────────────────────
      // ASSINATURA (NÃO BLOQUEANTE)
      // ─────────────────────────────
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
            console.warn('⚠️ Assinatura inválida (não bloqueado)');
          }
        } catch (e) {
          console.warn('⚠️ Erro validação assinatura:', e);
        }
      }

      // ─────────────────────────────
      // FETCH MP DATA
      // ─────────────────────────────
      const resp = await axios.get<MercadoPagoPayment>(
        `https://api.mercadopago.com/v1/payments/${id}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      const mpData = resp.data;

      if (!mpData?.status) {
        res.sendStatus(200);
        return;
      }

      const paymentType = mpData.payment_type_id;

      // =====================================================
      // 💰 PIX FLOW
      // =====================================================
      if (paymentType === 'pix') {
        const estabelecimentos = await db
          .collection('estabelecimentos')
          .where('pixPagamentoId', '==', id)
          .limit(1)
          .get();

        if (estabelecimentos.empty) {
          res.sendStatus(200);
          return;
        }

        const ref = estabelecimentos.docs[0].ref;
        const dataEstab = estabelecimentos.docs[0].data();

        const status = mpData.status;
        const isApproved = status === 'approved';

        // 🔥 idempotência
        if (dataEstab?.pixStatus === 'approved') {
          res.sendStatus(200);
          return;
        }

        await ref.update({
          pixStatus: status,
          statusPagamento: status,
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 🔥 ativação
        if (isApproved) {
          await ref.update({
            plano: dataEstab?.planoPendente || dataEstab?.plano,
            planoPendente: admin.firestore.FieldValue.delete(),

            assinaturaAtiva: true,
            statusPlano: 'ativo',

            pixStatus: 'approved',
            statusPagamento: 'approved',

            expiraEm: admin.firestore.Timestamp.fromDate(
              new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            ),

            atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        res.sendStatus(200);
        return;
      }

      // =====================================================
      // 💳 CARTÃO FLOW
      // =====================================================
      if (paymentType === 'credit_card') {
        const estabelecimentoId = mpData.external_reference;

        if (!estabelecimentoId) {
          res.sendStatus(200);
          return;
        }

        const ref = db.collection('estabelecimentos').doc(estabelecimentoId);
        const snap = await ref.get();

        if (!snap.exists) {
          res.sendStatus(200);
          return;
        }

        const status = mpData.status;

        const isApproved =
          status === 'authorized' ||
          status === 'active' ||
          status === 'approved';

        await ref.update({
  statusPagamento: status,
  assinaturaAtiva: isApproved,
  statusPlano: isApproved ? "ativo" : "pendente",
  paymentType: mpData.payment_type_id || "credit_card",
  atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
});

        if (isApproved) {
          await ref.update({
            assinaturaAtiva: true,
            statusPlano: 'ativo',
          });
        }

        res.sendStatus(200);
        return;
      }

      res.sendStatus(200);
      return;

    } catch (error) {
      console.error('🔥 WEBHOOK ERROR:', error);
      res.sendStatus(200);
    }
  }
);