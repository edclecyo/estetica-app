import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import axios from 'axios';
import { defineSecret } from 'firebase-functions/params';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

// 🔐 SECRET CORRETO
const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN');

// ================= HELPERS =================
function parseValor(valor: any): number {
  if (typeof valor === 'number') return valor;

  const n = Number(
    String(valor || 0)
      .replace(/\./g, '')
      .replace(',', '.')
  );

  return isNaN(n) ? 0 : n;
}

const axiosInstance = axios.create({
  timeout: 12000,
});

// =====================================================
// 1. PIX CLIENTE (SEM MP - DIRETO)
// =====================================================
export const criarPagamentoCliente = onCall(
  { region: REGION },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Acesso negado');
    }

    const { agendamentoId } = req.data;

    if (!agendamentoId) {
      throw new HttpsError('invalid-argument', 'ID obrigatório');
    }

    const agRef = db.collection('agendamentos').doc(agendamentoId);
    const agSnap = await agRef.get();

    if (!agSnap.exists) {
      throw new HttpsError('not-found', 'Agendamento não encontrado');
    }

    const ag = agSnap.data()!;

    if (ag.clienteUid !== req.auth.uid) {
      throw new HttpsError('permission-denied', 'Sem permissão');
    }

    const estabSnap = await db
      .collection('estabelecimentos')
      .doc(ag.estabelecimentoId)
      .get();

    const estab = estabSnap.data();

    if (!estab) {
      throw new HttpsError('not-found', 'Estabelecimento não encontrado');
    }

    // 🚨 BLOQUEIO DE PLANO
    if (!estab?.plano || !['pro', 'elite'].includes(estab.plano)) {
      throw new HttpsError(
        'failed-precondition',
        'Este estabelecimento não aceita pagamento pelo app'
      );
    }

    if (!estab?.pixChave) {
      throw new HttpsError(
        'failed-precondition',
        'Estabelecimento sem PIX'
      );
    }

    return {
      pixChave: estab.pixChave,
      pixTipo: estab.pixTipo || 'aleatoria',
      valor: ag.servicoPreco,
      nome: estab.nome,
      descricao: ag.servicoNome,
    };
  }
);

// =====================================================
// 2. PIX ASSINATURA (MERCADO PAGO)
// =====================================================
export const criarPagamentoPixAssinatura = onCall(
  {
    region: REGION,
    secrets: [MP_ACCESS_TOKEN],
  },
  async (req) => {

    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Acesso negado');
    }

    const { estabelecimentoId, plano, valor } = req.data || {};

    if (!estabelecimentoId || !plano || !valor) {
      throw new HttpsError('invalid-argument', 'Dados inválidos');
    }

    const ref = db.collection('estabelecimentos').doc(estabelecimentoId);
    const lockRef = db.collection('locks').doc(`pix_assinatura_${estabelecimentoId}`);

    return db.runTransaction(async (tx) => {

      const [snap, lockSnap] = await Promise.all([
        tx.get(ref),
        tx.get(lockRef),
      ]);

      if (!snap.exists) {
        throw new HttpsError('not-found', 'Estabelecimento não encontrado');
      }

      const est = snap.data()!;

      if (est.adminId !== req.auth!.uid) {
        throw new HttpsError('permission-denied', 'Sem permissão');
      }

      const now = Date.now();

      // 🔥 LOCK COM EXPIRAÇÃO
      if (lockSnap.exists) {
        const created = lockSnap.data()?.createdAt?.toMillis?.() || 0;

        if (now - created < 60000) {
          throw new HttpsError(
            'resource-exhausted',
            'Pagamento em processamento'
          );
        }
      }

      tx.set(lockRef, {
        createdAt: FieldValue.serverTimestamp(),
      });

      const valorFinal = parseValor(valor);

      const accessToken = MP_ACCESS_TOKEN.value();

      if (!accessToken) {
        throw new HttpsError('internal', 'MP não configurado');
      }

      let resp;

      try {
        resp = await axiosInstance.post(
          'https://api.mercadopago.com/v1/payments',
          {
            transaction_amount: valorFinal,
            payment_method_id: 'pix',
            description: `Assinatura plano ${plano}`,
            external_reference: estabelecimentoId,
            payer: {
              email: req.auth!.token.email || 'cliente@app.com',
            },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'X-Idempotency-Key': `pix_${estabelecimentoId}_${Date.now()}`,
            },
          }
        );
      } catch (err: any) {
        console.error('Erro MP:', err?.response?.data || err);

        throw new HttpsError(
          'internal',
          'Erro ao criar pagamento PIX'
        );
      }

      const data: any = resp.data;

      const qr = data?.point_of_interaction?.transaction_data;

      const qrBase64 = qr?.qr_code_base64 || null;
      const qrText = qr?.qr_code || null;

      if (!qrBase64 && !qrText) {
        throw new HttpsError(
          'internal',
          'PIX inválido retornado pelo MP'
        );
      }

      const expira = new Date();
      expira.setMinutes(expira.getMinutes() + 30);

      // 🔥 SALVA CORRETAMENTE (CRÍTICO)
      tx.update(ref, {
        planoPendente: plano,

        pixStatus: 'pending',
        statusPagamento: 'pending',
        assinaturaAtiva: false,

        pixPagamentoId: String(data?.id), // 🔥 ESSENCIAL

        pixQrCode: qrText,
        pixQrCodeBase64: qrBase64,

        pixCriadoEm: FieldValue.serverTimestamp(),
        pixExpiraEm: Timestamp.fromDate(expira),

        atualizadoEm: FieldValue.serverTimestamp(),
      });

      // 🔥 REMOVE LOCK (IMPORTANTE)
      tx.delete(lockRef);

      return {
        qr_code: qrText,
        qr_code_base64: qrBase64,
      };
    });
  }
);