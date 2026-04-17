import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import axios from 'axios';

import { db } from '../config/firebase';
import { REGION } from '../config/region';
import { 
  MPQrResponse, 
  MPPreapprovalResponse, 
  MPCustomerResponse, 
  MPCardResponse 
} from '../types';

/**
 * ─── 1. PAGAMENTO CLIENTE -> ESTABELECIMENTO (PIX) ───
 * Não precisa do segredo global porque usa o token do próprio estabelecimento
 */
export const criarPagamentoCliente = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

    const { agendamentoId } = request.data;
    if (!agendamentoId) throw new HttpsError('invalid-argument', 'Agendamento obrigatório');

    const agendRef = db.collection('agendamentos').doc(agendamentoId);
    const agendSnap = await agendRef.get();

    if (!agendSnap.exists) throw new HttpsError('not-found', 'Agendamento não encontrado');

    const agend = agendSnap.data()!;
    const estabSnap = await db.collection('estabelecimentos').doc(agend.estabelecimentoId).get();
    const estab = estabSnap.data();

    if (!estab?.mpAccessToken) {
      throw new HttpsError('failed-precondition', 'Estabelecimento não conectado ao Mercado Pago');
    }

    try {
      const resp = await axios.post<MPQrResponse>(
        'https://api.mercadopago.com/v1/payments',
        {
          transaction_amount: Number(agend.servicoPreco),
          description: `Serviço: ${agend.servicoNome}`,
          payment_method_id: 'pix',
          external_reference: agendamentoId,
          payer: { email: `cliente_${request.auth.uid}@app.com` }
        },
        { headers: { Authorization: `Bearer ${estab.mpAccessToken}` } }
      );

      const data = resp.data;
      const qr = data.point_of_interaction?.transaction_data;
      const taxa = Number(agend.servicoPreco) * 0.10;

      await agendRef.update({
        pagamentoId: data.id,
        formaPagamento: 'pix',
        statusPagamento: 'pendente',
        qrCode: qr?.qr_code || null,
        qrCodeBase64: qr?.qr_code_base64 || null,
        valorTotal: agend.servicoPreco,
        taxaApp: taxa,
        atualizadoEm: FieldValue.serverTimestamp()
      });

      return {
        qr_code: qr?.qr_code,
        qr_code_base64: qr?.qr_code_base64,
      };

    } catch (error: any) {
      console.error("Erro MP Cliente:", error?.response?.data || error.message);
      throw new HttpsError('internal', 'Erro ao gerar PIX para o cliente');
    }
  }
);

/**
 * ─── 2. PAGAMENTO ASSINATURA PIX (ESTABELECIMENTO -> APP) ───
 */
export const criarPagamentoPixAssinatura = onCall(
  { 
    region: REGION,
    secrets: ["MP_ACCESS_TOKEN"] // 👈 CRÍTICO: Dá permissão à função
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

    const { estabelecimentoId, plano, valor } = request.data;
    if (!estabelecimentoId || !plano || !valor) throw new HttpsError('invalid-argument', 'Dados inválidos');

    const valorFinal = Number(valor) * 0.95;

    try {
      const resp = await axios.post<MPQrResponse>(
        'https://api.mercadopago.com/v1/payments',
        {
          transaction_amount: valorFinal,
          description: `Assinatura Plano ${plano} - BeautyHub`,
          payment_method_id: 'pix',
          external_reference: estabelecimentoId,
          payer: { email: `admin_${request.auth.uid}@app.com` }
        },
        { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
      );

      const data = resp.data;
      const qr = data.point_of_interaction?.transaction_data;

      await db.collection('estabelecimentos').doc(estabelecimentoId).update({
        pagamentoPixId: data.id,
        planoTemp: plano,
        valorPix: valorFinal,
        statusPagamento: 'pendente',
        atualizadoEm: FieldValue.serverTimestamp()
      });

      return {
        qr_code: qr?.qr_code,
        qr_code_base64: qr?.qr_code_base64,
        valor: valorFinal
      };

    } catch (error: any) {
      throw new HttpsError('internal', 'Erro ao gerar PIX da assinatura');
    }
  }
);

/**
 * ─── 3. ASSINATURA RECORRENTE CARTÃO ───
 */
export const criarAssinaturaCartao = onCall(
  { 
    region: REGION,
    secrets: ["MP_ACCESS_TOKEN"] // 👈 CRÍTICO: Dá permissão à função
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

    const { estabelecimentoId, plano, token, email } = request.data;
    const adminId = request.auth.uid;

    const estRef = db.collection('estabelecimentos').doc(estabelecimentoId);
    const estSnap = await estRef.get();

    if (!estSnap.exists || estSnap.data()?.adminId !== adminId) {
      throw new HttpsError('permission-denied', 'Sem permissão');
    }

    const planos: Record<string, number> = { essencial: 29.9, pro: 49.9, elite: 89.99 };
    const valor = planos[plano];
    if (!valor) throw new HttpsError('invalid-argument', 'Plano inválido');

    try {
      let customerId = estSnap.data()?.mpCustomerId;

      if (!customerId) {
        const cResp = await axios.post<MPCustomerResponse>(
          'https://api.mercadopago.com/v1/customers',
          { email },
          { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
        );
        customerId = cResp.data.id;
        await estRef.update({ mpCustomerId: customerId });
      }

      const cardResp = await axios.post<MPCardResponse>(
        `https://api.mercadopago.com/v1/customers/${customerId}/cards`,
        { token },
        { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
      );

      const preResp = await axios.post<MPPreapprovalResponse>(
        'https://api.mercadopago.com/preapproval',
        {
          reason: `Plano ${plano} - BeautyHub`,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: valor,
            currency_id: "BRL",
          },
          payer_email: email,
          card_id: cardResp.data.id,
          status: "authorized",
        },
        { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
      );

      const expira = new Date();
      expira.setDate(expira.getDate() + 30);

      await estRef.update({
        plano,
        assinaturaAtiva: true,
        mercadoPagoId: preResp.data.id,
        statusPagamento: 'authorized',
        expiraEm: Timestamp.fromDate(expira),
        atualizadoEm: FieldValue.serverTimestamp(),
      });

      return { ok: true, assinaturaId: preResp.data.id };

    } catch (error: any) {
      throw new HttpsError('internal', 'Erro ao processar assinatura no cartão');
    }
  }
);