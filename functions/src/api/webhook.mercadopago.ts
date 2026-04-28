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
const MP_WEBHOOK_TOKEN = defineSecret('MP_WEBHOOK_TOKEN');
const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN');

// ─────────────────────────────────────────────
// TYPES (evita erro TS unknown)
// ─────────────────────────────────────────────
type MercadoPagoPayment = {
  id: string;
  status: string;
  payment_type_id?: string;
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
    secrets: [
      MP_WEBHOOK_SECRET,
      MP_WEBHOOK_TOKEN,
      MP_ACCESS_TOKEN
    ]
  },
  async (req, res): Promise<void> => {
    try {

      const tokenWebhook = MP_WEBHOOK_TOKEN.value();
      const segredoWebhook = MP_WEBHOOK_SECRET.value();
      const accessToken = MP_ACCESS_TOKEN.value();

      const tokenQuery = Array.isArray(req.query.token)
        ? req.query.token[0]
        : req.query.token;

      // ─────────────────────────────
      // TOKEN CHECK
      // ─────────────────────────────
      if (tokenWebhook && tokenQuery !== tokenWebhook) {
        res.sendStatus(401);
        return;
      }

      const data = req.body?.data;
      if (!data?.id) {
        res.sendStatus(200);
        return;
      }

      const id: string = data.id;

      // ─────────────────────────────
      // ASSINATURA CHECK
      // ─────────────────────────────
      if (segredoWebhook) {
        const signature = Array.isArray(req.headers["x-signature"])
          ? req.headers["x-signature"][0]
          : req.headers["x-signature"];

        const requestId = Array.isArray(req.headers["x-request-id"])
          ? req.headers["x-request-id"][0]
          : req.headers["x-request-id"];

        const ok = validarAssinaturaMercadoPago(
          signature,
          requestId,
          id,
          segredoWebhook
        );

        if (!ok) {
          res.sendStatus(401);
          return;
        }
      }

      // ─────────────────────────────
      // FETCH MP DATA
      // ─────────────────────────────
      let mpData: MercadoPagoPayment;
      let tipo: 'pix' | 'assinatura' = 'assinatura';

      try {
        const resp = await axios.get<MercadoPagoPayment>(
          `https://api.mercadopago.com/v1/payments/${id}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        mpData = resp.data;
        tipo = 'pix';
      } catch {
        const resp = await axios.get<MercadoPagoPayment>(
          `https://api.mercadopago.com/preapproval/${id}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        mpData = resp.data;
        tipo = 'assinatura';
      }

      if (!mpData?.status) {
        res.sendStatus(200);
        return;
      }

      // =====================================================
      // 💰 PIX FLOW
      // =====================================================
      if (tipo === 'pix') {

        const estabelecimentos = await db
          .collection("estabelecimentos")
          .where("pixPagamentoId", "==", id)
          .limit(1)
          .get();

        if (estabelecimentos.empty) {
          res.sendStatus(200);
          return;
        }

        const ref = estabelecimentos.docs[0].ref;
        const freshSnap = await ref.get();
const dataEstab = freshSnap.data();

        const status = mpData.status;
        const isApproved = status === 'approved';

        // 🔥 IDEMPOTÊNCIA
        if (dataEstab?.pixStatus === 'approved') {
          res.sendStatus(200);
          return;
        }

        await ref.update({
          pixStatus: status,
          statusPagamento: status,
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 🔥 ATIVAÇÃO REAL
        if (isApproved) {
  const planoFinal = dataEstab?.planoPendente;

  await ref.update({
    plano: planoFinal || dataEstab?.plano,
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
      // 📦 ASSINATURA CARTÃO
      // =====================================================
      const snap = await db
        .collection("estabelecimentos")
        .where("mercadoPagoId", "==", id)
        .limit(1)
        .get();

      if (snap.empty) {
        res.sendStatus(200);
        return;
      }

      const ref = snap.docs[0].ref;

      const status = mpData.status;
      const isAuthorized = status === "authorized";

      await ref.update({
        statusPagamento: status,
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (isAuthorized) {
        await ref.update({
          assinaturaAtiva: true,
        });
      }

      res.sendStatus(200);
      return;

    } catch (error: any) {
      console.error("🔥 WEBHOOK ERROR:", error);
      res.sendStatus(200);
      return;
    }
  }
);