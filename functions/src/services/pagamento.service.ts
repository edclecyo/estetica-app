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
  timeout: 20000, 
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
// 3. CARTÃO ASSINATURA
// =====================================================
export const criarAssinaturaCartao = onCall(
  {
    region: REGION,
    secrets: [MP_ACCESS_TOKEN],
  },
  async (req) => {
    // 1. Validação de Autenticação
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Acesso negado. Usuário não autenticado.');
    }

    const {
      estabelecimentoId,
      plano,
      email,
      token,
      valor,
      payment_method_id
    } = req.data || {};

    // 2. Validação de Dados de Entrada
    if (!estabelecimentoId || !plano || !email || !token) {
      throw new HttpsError('invalid-argument', 'Dados insuficientes para processar o pagamento.');
    }

    const ref = db.collection('estabelecimentos').doc(estabelecimentoId);
    const snap = await ref.get();

    if (!snap.exists) {
      throw new HttpsError('not-found', 'Estabelecimento não encontrado.');
    }

    const est = snap.data()!;

    // 3. Verificação de Permissão (Dono do estabelecimento)
    if (est.adminId !== req.auth.uid) {
      throw new HttpsError('permission-denied', 'Você não tem permissão para realizar esta cobrança.');
    }

    // 4. Evitar duplicidade de plano ativo
    if (est.assinaturaAtiva && est.plano === plano) {
      throw new HttpsError('already-exists', 'Este plano já está ativo para este estabelecimento.');
    }

    try {
      const accessToken = MP_ACCESS_TOKEN.value();
      if (!accessToken) {
        throw new HttpsError('internal', 'Configuração do Mercado Pago ausente (AccessToken).');
      }

      // Garante que o valor seja um número válido para o MP
      const valorFinal = parseValor(valor);
      if (valorFinal <= 0) {
        throw new HttpsError('invalid-argument', 'O valor da assinatura deve ser maior que zero.');
      }

      // =================================================
      // CHAMADA À API DO MERCADO PAGO
      // =================================================
      const response = await axiosInstance.post(
        'https://api.mercadopago.com/v1/payments',
        {
          transaction_amount: valorFinal,
          token: token,
          description: `Assinatura Plano ${plano.toUpperCase()} - ${estabelecimentoId}`,
          installments: 1,
          payment_method_id: payment_method_id,
          payer: {
            email: email.trim().toLowerCase(),
          },
          external_reference: estabelecimentoId,
          notification_url: "SUA_URL_DE_WEBHOOK_AQUI", // Opcional: para receber atualizações automáticas
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-Idempotency-Key': `card_${estabelecimentoId}_${Date.now()}`,
            'Content-Type': 'application/json'
          },
        }
      );

      const data: any = response.data;

      // =================================================
      // PROCESSAMENTO DO STATUS
      // =================================================
      const aprovado = data.status === 'approved' || data.status === 'authorized';

      // Atualiza o Firestore com o resultado da transação
      await ref.update({
        planoPendente: plano,
        statusPagamento: data.status || 'pending',
        paymentType: 'credit_card',
        assinaturaAtiva: aprovado,
        statusPlano: aprovado ? 'ativo' : 'pendente',
        pagamentoId: String(data.id),
        atualizadoEm: FieldValue.serverTimestamp(),
        // Opcional: guardar o motivo da rejeição se não for aprovado
        statusDetail: data.status_detail || null 
      });

      return {
        success: true,
        status: data.status,
        id: data.id,
        detail: data.status_detail
      };

    } catch (error: any) {
      const mpError = error?.response?.data;
      
      // Log detalhado no console do Firebase para você debugar
      console.error('--- ERRO MERCADO PAGO ---');
      console.error('Status:', error?.response?.status);
      console.error('Dados:', JSON.stringify(mpError, null, 2));

      // 1. Erros de validação de campos (Ex: e-mail inválido, cartão inválido)
      if (mpError?.cause && Array.isArray(mpError.cause) && mpError.cause.length > 0) {
        const desc = mpError.cause[0].description;
        throw new HttpsError('invalid-argument', `Mercado Pago: ${desc}`);
      }

      // 2. Erros de parâmetros genéricos
      if (mpError?.message) {
        throw new HttpsError('internal', `Erro MP: ${mpError.message}`);
      }

      // 3. Erro de rede ou desconhecido
      throw new HttpsError(
        'internal',
        'Não foi possível validar o cartão junto à operadora.'
      );
    }
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
      throw new HttpsError(
        'unauthenticated',
        'Acesso negado'
      );
    }

   const {
  estabelecimentoId,
  plano,
  valor
} = req.data || {};

    if (!estabelecimentoId || !plano || !valor) {
      throw new HttpsError(
        'invalid-argument',
        'Dados inválidos'
      );
    }

    const ref = db
      .collection('estabelecimentos')
      .doc(estabelecimentoId);

    const lockRef = db
      .collection('locks')
      .doc(`pix_assinatura_${estabelecimentoId}`);

    // =====================================================
    // VALIDAÇÕES
    // =====================================================

    const snap = await ref.get();

    if (!snap.exists) {
      throw new HttpsError(
        'not-found',
        'Estabelecimento não encontrado'
      );
    }

    const est = snap.data()!;

if (!est?.pixChave || !est?.pixTipo) {
  throw new HttpsError(
    'failed-precondition',
    'CONTA_BANCARIA_INCOMPLETA'
  );
}
    if (est.adminId !== req.auth.uid) {
      throw new HttpsError(
        'permission-denied',
        'Sem permissão'
      );
    }

    // 🔥 NÃO COMPRA O MESMO PLANO
    if (
      est.assinaturaAtiva &&
      est.plano === plano
    ) {

      throw new HttpsError(
        'already-exists',
        'Este plano já está ativo'
      );
    }

    // =====================================================
    // LOCK
    // =====================================================

    const lockSnap = await lockRef.get();

    if (lockSnap.exists) {

      const created =
        lockSnap.data()?.createdAt?.toMillis?.() || 0;

      const diff = Date.now() - created;

      if (diff < 60000) {

        throw new HttpsError(
          'resource-exhausted',
          'Pagamento em processamento'
        );
      }

      // LOCK VELHO
      await lockRef.delete();
    }

    await lockRef.set({
      createdAt: FieldValue.serverTimestamp(),
    });

    try {

      // =====================================================
      // MERCADO PAGO
      // =====================================================

      const valorFinal = parseValor(valor);

      const accessToken = String(
  MP_ACCESS_TOKEN.value() || ''
).trim();

      if (!accessToken) {

        throw new HttpsError(
          'internal',
          'MP não configurado'
        );
      }

      const response = await axiosInstance.post(
        'https://api.mercadopago.com/v1/payments',
        {
          transaction_amount: valorFinal,

          payment_method_id: 'pix',

          description:
            `Assinatura plano ${plano}`,

          external_reference: estabelecimentoId,

          payer: {
            email:
              req.auth.token.email ||
              'cliente@app.com',
          },
        },
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            'X-Idempotency-Key':
              `pix_${estabelecimentoId}_${Date.now()}`
          },
        }
      );

      const data: any = response.data;

      const qr =
        data?.point_of_interaction
          ?.transaction_data;

      const qrBase64 =
        qr?.qr_code_base64 || null;

      const qrText =
        qr?.qr_code || null;

      if (!qrBase64 && !qrText) {

        throw new HttpsError(
          'internal',
          'PIX inválido retornado pelo MP'
        );
      }

      // =====================================================
      // EXPIRAÇÃO
      // =====================================================

      const expira = new Date();

      expira.setMinutes(
        expira.getMinutes() + 30
      );

      // =====================================================
      // LIMPA PIX ANTIGO + SALVA NOVO
      // =====================================================

      await ref.update({

        // PLANO
        planoPendente: plano,

        // PAGAMENTO
        pixStatus: 'pending',
        statusPagamento: 'pending',

        assinaturaAtiva: false,

        // PIX
        pixPagamentoId: String(data?.id),

        pixQrCode: qrText,
        pixQrCodeBase64: qrBase64,

        pixCriadoEm:
          FieldValue.serverTimestamp(),

        pixExpiraEm:
          Timestamp.fromDate(expira),

        atualizadoEm:
          FieldValue.serverTimestamp(),
      });

      // =====================================================
      // REMOVE LOCK
      // =====================================================

      await lockRef.delete();

      return {

        qr_code: qrText,

        qr_code_base64: qrBase64,
      };

    } catch (error: any) {

      console.error(
        'ERRO PIX:',
        error?.response?.data || error
      );

      // REMOVE LOCK MESMO COM ERRO
      await lockRef.delete();

      throw new HttpsError(
        'internal',
        'Erro ao criar PIX'
      );
    }
  }
);