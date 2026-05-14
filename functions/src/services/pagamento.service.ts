import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import axios from 'axios';
import { defineSecret } from 'firebase-functions/params';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

// 🔐 SECRET
const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN');

// =====================================================
// HELPERS
// =====================================================

function parseValor(valor: any): number {

  if (typeof valor === 'number') {
    return valor;
  }

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
// 1. PIX CLIENTE
// =====================================================

export const criarPagamentoCliente = onCall(
  { region: REGION },

  async (req) => {

    if (!req.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Acesso negado'
      );
    }

    const { agendamentoId } = req.data;

    if (!agendamentoId) {
      throw new HttpsError(
        'invalid-argument',
        'ID obrigatório'
      );
    }

    const agRef =
      db.collection('agendamentos')
        .doc(agendamentoId);

    const agSnap = await agRef.get();

    if (!agSnap.exists) {
      throw new HttpsError(
        'not-found',
        'Agendamento não encontrado'
      );
    }

    const ag = agSnap.data()!;

    if (ag.clienteUid !== req.auth.uid) {
      throw new HttpsError(
        'permission-denied',
        'Sem permissão'
      );
    }

    const estabSnap =
      await db
        .collection('estabelecimentos')
        .doc(ag.estabelecimentoId)
        .get();

    const estab = estabSnap.data();

    if (!estab) {
      throw new HttpsError(
        'not-found',
        'Estabelecimento não encontrado'
      );
    }

    if (
      !estab?.plano ||
      !['pro', 'elite'].includes(estab.plano)
    ) {
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
// 2. PIX ASSINATURA
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

    if (
      !estabelecimentoId ||
      !plano ||
      !valor
    ) {
      throw new HttpsError(
        'invalid-argument',
        'Dados inválidos'
      );
    }

    const ref =
      db.collection('estabelecimentos')
        .doc(estabelecimentoId);

    const lockRef =
      db.collection('locks')
        .doc(`pix_assinatura_${estabelecimentoId}`);

    const snap = await ref.get();

    if (!snap.exists) {
      throw new HttpsError(
        'not-found',
        'Estabelecimento não encontrado'
      );
    }

    const est = snap.data()!;

    if (est.adminId !== req.auth.uid) {
      throw new HttpsError(
        'permission-denied',
        'Sem permissão'
      );
    }

    // 🔥 REMOVIDO:
    // NÃO PRECISA pixChave/pixTipo
    // pois o PIX é da SUA conta Mercado Pago

    if (
      est.assinaturaAtiva &&
      est.plano === plano
    ) {
      throw new HttpsError(
        'already-exists',
        'Plano já ativo'
      );
    }

    // =====================================================
    // LOCK
    // =====================================================

    const lockSnap = await lockRef.get();

    if (lockSnap.exists) {

      const created =
        lockSnap.data()?.createdAt?.toMillis?.() || 0;

      if (Date.now() - created < 60000) {
        throw new HttpsError(
          'resource-exhausted',
          'Em processamento'
        );
      }

      await lockRef.delete();
    }

    await lockRef.set({
      createdAt: FieldValue.serverTimestamp(),
    });

    try {

      const accessToken =
        String(MP_ACCESS_TOKEN.value() || '').trim();

      if (!accessToken) {
        throw new HttpsError(
          'internal',
          'MP não configurado'
        );
      }

      // =====================================================
      // USER
      // =====================================================

      const snapUser =
        await db.collection('users')
          .doc(req.auth.uid)
          .get();

      const user = snapUser.data();

      // =====================================================
      // MERCADO PAGO
      // =====================================================

      const response = await axiosInstance.post(
        'https://api.mercadopago.com/v1/payments',

        {
          transaction_amount: parseValor(valor),

          payment_method_id: 'pix',

          description: `Assinatura plano ${plano}`,

          external_reference: estabelecimentoId,

          notification_url:
            'https://webhookmercadopago-eoqa32y7ca-rj.a.run.app',

          payer: {

            email:
              user?.email ||
              req.auth.token.email ||
              'cliente@app.com',

            first_name:
              user?.nome || 'Cliente',

            identification: user?.cpf
              ? {
                  type: 'CPF',
                  number:
                    user.cpf.replace(/\D/g, ''),
                }
              : undefined,

            phone: user?.telefone
              ? {
                  number:
                    user.telefone.replace(/\D/g, ''),
                }
              : undefined,
          },
        },

        {
          headers: {
            Authorization: `Bearer ${accessToken}`,

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
          'PIX inválido'
        );
      }

      // =====================================================
      // HISTÓRICO
      // =====================================================

      await db.collection('pagamentos').add({

        estabelecimentoId,
        plano,

        valor: parseValor(valor),

        clienteId: req.auth.uid,

        clienteEmail:
          req.auth.token.email || null,

        clienteNome:
          user?.nome || 'Estabelecimento',

        status: 'pending',

        metodo: 'pix',

        mercadoPagoId: String(data.id),

        criadoEm:
          FieldValue.serverTimestamp(),
      });

      // =====================================================
      // EXPIRAÇÃO
      // =====================================================

      const expira = new Date();

      expira.setMinutes(
        expira.getMinutes() + 30
      );

      // =====================================================
      // FIRESTORE
      // =====================================================

      await ref.update({

        planoPendente: plano,

        paymentStatus: 'pending',

        assinaturaAtiva: false,

        pixPagamentoId:
          String(data?.id),

        pixQrCode: qrText,

        pixQrCodeBase64: qrBase64,

        pixCriadoEm:
          FieldValue.serverTimestamp(),

        pixExpiraEm:
          Timestamp.fromDate(expira),

        atualizadoEm:
          FieldValue.serverTimestamp(),
      });

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

      await lockRef.delete();

      throw new HttpsError(
        'internal',
        'Erro ao criar PIX'
      );
    }
  }
);
// =====================================================
// 4. PIX IMPULSIONAMENTO / DESTAQUE
// =====================================================

export const criarPagamentoPixImpulsionamento = onCall(
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
      pacoteId,
    } = req.data || {};

    if (!estabelecimentoId || !pacoteId) {
      throw new HttpsError(
        'invalid-argument',
        'Dados inválidos'
      );
    }

    const PACOTES: Record<string, {
      nome: string;
      valor: number;
      dias: number;
    }> = {
      destaque_1d: {
        nome: 'Destaque 24 horas',
        valor: 5,
        dias: 1,
      },
      destaque_3d: {
        nome: 'Destaque 3 dias',
        valor: 12,
        dias: 3,
      },
      destaque_7d: {
        nome: 'Destaque 7 dias',
        valor: 25,
        dias: 7,
      },
    };

    const pacote = PACOTES[pacoteId];

    if (!pacote) {
      throw new HttpsError(
        'invalid-argument',
        'Pacote inválido'
      );
    }

    const ref = db
      .collection('estabelecimentos')
      .doc(estabelecimentoId);

    const snap = await ref.get();

    if (!snap.exists) {
      throw new HttpsError(
        'not-found',
        'Estabelecimento não encontrado'
      );
    }

    const est = snap.data()!;

    if (est.adminId !== req.auth.uid) {
      throw new HttpsError(
        'permission-denied',
        'Sem permissão'
      );
    }

    const lockRef = db
      .collection('locks')
      .doc(`pix_impulsionamento_${estabelecimentoId}`);

    const lockSnap = await lockRef.get();

    if (lockSnap.exists) {
      const created =
        lockSnap.data()?.createdAt?.toMillis?.() || 0;

      if (Date.now() - created < 60000) {
        throw new HttpsError(
          'resource-exhausted',
          'Em processamento'
        );
      }

      await lockRef.delete();
    }

    await lockRef.set({
      createdAt: FieldValue.serverTimestamp(),
    });

    try {
      const accessToken =
        String(MP_ACCESS_TOKEN.value() || '').trim();

      if (!accessToken) {
        throw new HttpsError(
          'internal',
          'MP não configurado'
        );
      }

      const userSnap = await db
        .collection('users')
        .doc(req.auth.uid)
        .get();

      const user = userSnap.data();

      const response = await axiosInstance.post(
        'https://api.mercadopago.com/v1/payments',
        {
          transaction_amount: pacote.valor,
          payment_method_id: 'pix',
          description: `Impulsionamento - ${pacote.nome}`,
          external_reference: estabelecimentoId,
          notification_url:
            'https://webhookmercadopago-eoqa32y7ca-rj.a.run.app',

          payer: {
            email:
              user?.email ||
              req.auth.token.email ||
              est.responsavelEmail ||
              'cliente@app.com',

            first_name:
              user?.nome ||
              est.responsavelNome ||
              'Cliente',

            identification: user?.cpf
              ? {
                  type: 'CPF',
                  number: String(user.cpf).replace(/\D/g, ''),
                }
              : est.responsavelCpf
              ? {
                  type: 'CPF',
                  number: String(est.responsavelCpf).replace(/\D/g, ''),
                }
              : undefined,

            phone: user?.telefone
              ? {
                  number: String(user.telefone).replace(/\D/g, ''),
                }
              : est.responsavelTelefone
              ? {
                  number: String(est.responsavelTelefone).replace(/\D/g, ''),
                }
              : undefined,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Idempotency-Key':
              `imp_${estabelecimentoId}_${pacoteId}_${Date.now()}`,
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
          'PIX inválido'
        );
      }

      const expira = new Date();
      expira.setMinutes(expira.getMinutes() + 30);

      const pagamentoRef = await db
        .collection('pagamentos')
        .add({
          tipo: 'impulsionamento',

          estabelecimentoId,
          pacoteId,
          pacoteNome: pacote.nome,
          dias: pacote.dias,

          valor: pacote.valor,

          clienteId: req.auth.uid,
          clienteEmail: req.auth.token.email || null,
          clienteNome:
            user?.nome ||
            est.responsavelNome ||
            'Estabelecimento',

          status: 'pending',
          metodo: 'pix',
          mercadoPagoId: String(data.id),

          qrCode: qrText,
          qrCodeBase64: qrBase64,

          criadoEm: FieldValue.serverTimestamp(),
          expiraEm: Timestamp.fromDate(expira),
        });

      await ref.update({
        impulsionamentoPendente: {
          pagamentoDocId: pagamentoRef.id,
          mercadoPagoId: String(data.id),
          pacoteId,
          pacoteNome: pacote.nome,
          dias: pacote.dias,
          valor: pacote.valor,
          status: 'pending',
          criadoEm: FieldValue.serverTimestamp(),
          expiraEm: Timestamp.fromDate(expira),
        },

        atualizadoEm: FieldValue.serverTimestamp(),
      });

      await lockRef.delete();

      return {
        qr_code: qrText,
        qr_code_base64: qrBase64,
        pagamentoId: pagamentoRef.id,
        mercadoPagoId: String(data.id),
      };
    } catch (error: any) {
      console.error(
        'ERRO PIX IMPULSIONAMENTO:',
        error?.response?.data || error
      );

      await lockRef.delete();

      throw new HttpsError(
        'internal',
        'Erro ao criar PIX de impulsionamento'
      );
    }
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

    if (!req.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Acesso negado.'
      );
    }

    const {
      estabelecimentoId,
      plano,
      email,
      token,
      valor,
      payment_method_id
    } = req.data || {};

    if (
      !estabelecimentoId ||
      !plano ||
      !email ||
      !token
    ) {
      throw new HttpsError(
        'invalid-argument',
        'Dados insuficientes.'
      );
    }

    const ref =
      db.collection('estabelecimentos')
        .doc(estabelecimentoId);

    const snap = await ref.get();

    if (!snap.exists) {
      throw new HttpsError(
        'not-found',
        'Estabelecimento não encontrado.'
      );
    }

    const est = snap.data()!;

    if (est.adminId !== req.auth.uid) {
      throw new HttpsError(
        'permission-denied',
        'Sem permissão.'
      );
    }

    if (
      est.assinaturaAtiva &&
      est.plano === plano
    ) {
      throw new HttpsError(
        'already-exists',
        'Plano já ativo.'
      );
    }

    try {

      const accessToken =
        MP_ACCESS_TOKEN.value();

      if (!accessToken) {
        throw new HttpsError(
          'internal',
          'MP não configurado.'
        );
      }

      const valorFinal =
        parseValor(valor);

      const response =
        await axiosInstance.post(

          'https://api.mercadopago.com/v1/payments',

          {
            transaction_amount: valorFinal,

            token,

            description:
              `Assinatura Plano ${plano}`,

            installments: 1,

            payment_method_id,

            payer: {

              email:
                est.responsavelEmail || email,

              first_name:
                est.responsavelNome || 'Responsável',

              identification:
                est.responsavelCpf
                  ? {
                      type: 'CPF',
                      number:
                        est.responsavelCpf
                          .replace(/\D/g, ''),
                    }
                  : undefined,

              phone:
                est.responsavelTelefone
                  ? {
                      number:
                        est.responsavelTelefone
                          .replace(/\D/g, ''),
                    }
                  : undefined,
            },

            external_reference:
              estabelecimentoId,

            notification_url:
              'https://webhookmercadopago-eoqa32y7ca-rj.a.run.app',
          },

          {
            headers: {

              Authorization:
                `Bearer ${accessToken}`,

              'X-Idempotency-Key':
                `card_${estabelecimentoId}_${Date.now()}`,
            },
          }
        );

      const data: any = response.data;

      const aprovado =
        data.status === 'approved' ||
        data.status === 'authorized';

      // =====================================================
      // FIRESTORE
      // =====================================================

      await ref.update({

        planoPendente: plano,

        paymentStatus:
          data.status || 'pending',

        paymentType: 'credit_card',

        pagamentoId:
          String(data.id),

        atualizadoEm:
          FieldValue.serverTimestamp(),

        statusDetail:
          data.status_detail || null,

        assinaturaAtiva: aprovado,

        statusPlano:
          aprovado
            ? 'ativo'
            : est.statusPlano || 'trial',

        ...(aprovado && {
          plano,
        }),
      });

      return {

        success: true,

        status: data.status,

        id: data.id,

        detail:
          data.status_detail
      };

    } catch (error: any) {

      console.error(
        'ERRO MP:',
        error?.response?.data || error
      );

      throw new HttpsError(
        'internal',
        'Erro ao processar pagamento.'
      );
    }
  }
);