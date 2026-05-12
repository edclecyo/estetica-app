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

export const webhookMercadoPago = onRequest(
  {
    region: REGION,
    secrets: [MP_WEBHOOK_SECRET, MP_ACCESS_TOKEN],
  },

  async (req, res): Promise<void> => {
    try {
      const segredoWebhook = MP_WEBHOOK_SECRET.value();
      const accessToken = MP_ACCESS_TOKEN.value()?.trim();

      console.log(
        'TOKEN DEBUG:',
        JSON.stringify(accessToken),
        accessToken?.length
      );

      const id = String(req.body?.data?.id || req.body?.id || '');

      if (!id) {
        console.log('❌ ID NÃO ENVIADO');
        res.sendStatus(200);
        return;
      }

      console.log('📩 WEBHOOK RECEBIDO:', id);

      // ================================
      // ASSINATURA (não bloqueante)
      // ================================
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

          if (!ok) console.warn('⚠️ assinatura inválida');
        } catch (e) {
          console.warn('⚠️ erro assinatura:', e);
        }
      }

      // ================================
      // BUSCA PAGAMENTO
      // ================================
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
        console.log('❌ STATUS NÃO ENCONTRADO');
        res.sendStatus(200);
        return;
      }

      const paymentType = mpData.payment_type_id;
      const status = mpData.status;

      console.log('💳 TYPE:', paymentType, 'STATUS:', status);

      const isApproved =
        status === 'approved' ||
        status === 'authorized' ||
        status === 'accredited';

      // =====================================================
      // 🔵 PIX
      // =====================================================
      if (paymentType === 'pix') {
        const snap = await db
          .collection('estabelecimentos')
          .where('pixPagamentoId', '==', id)
          .limit(1)
          .get();

        if (snap.empty) {
          res.sendStatus(200);
          return;
        }

        const ref = snap.docs[0].ref;
        const data = snap.docs[0].data() as any;

        // 🔒 evita duplicação REAL
        if (data?.pixPaymentId === id) {
          res.sendStatus(200);
          return;
        }

        if (isApproved) {
          await ref.update({
            plano: data?.planoPendente ?? data?.plano,
            planoPendente: admin.firestore.FieldValue.delete(),

            assinaturaAtiva: true,
            statusPlano: 'ativo',

            pixStatus: 'approved',
            statusPagamento: 'approved',

            pixProcessado: id,
            pixPaymentId: id,

            expiraEm: admin.firestore.Timestamp.fromDate(
              new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            ),

            atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log('✅ PIX APROVADO');
        } else {
          await ref.update({
            pixStatus: status,
            statusPagamento: status,
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log('⚠️ PIX STATUS:', status);
        }

        res.sendStatus(200);
        return;
      }

      // =====================================================
      // 🟡 CARTÃO
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

        const data = snap.data() as any;

        // 🔒 evita duplicação
        if (data?.statusPagamento === 'approved') {
          res.sendStatus(200);
          return;
        }

        if (isApproved) {
          await ref.update({
            plano: data?.planoPendente ?? data?.plano,
            planoPendente: admin.firestore.FieldValue.delete(),

            assinaturaAtiva: true,
            statusPlano: 'ativo',

            statusPagamento: 'approved',
            paymentType: 'credit_card',

            pagamentoId: id,

            expiraEm: admin.firestore.Timestamp.fromDate(
              new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            ),

            atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log('✅ CARTÃO APROVADO');
        } else {
          await ref.update({
            statusPagamento: status,
            paymentType: 'credit_card',
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log('⚠️ CARTÃO:', status);
        }

        res.sendStatus(200);
        return;
      }

      console.log('⚠️ PAYMENT TYPE NÃO TRATADO');
      res.sendStatus(200);

    } catch (error: any) {
      console.error('🔥 WEBHOOK ERROR', error?.response?.data || error);
      res.sendStatus(200);
    }
  }
);