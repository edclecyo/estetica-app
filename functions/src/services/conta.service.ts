import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

export const salvarDadosConta = onCall(
  { region: REGION },

  async (req) => {

    // =========================
    // AUTH
    // =========================
    if (!req.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Faça login'
      );
    }

    const {
      estabelecimentoId,
      responsavelNome,
      responsavelCpf,
      responsavelTelefone,
      responsavelEmail,
      pixChave,
      pixTipo,
    } = req.data || {};

    // =========================
    // VALIDACOES
    // =========================
    if (!estabelecimentoId) {
      throw new HttpsError(
        'invalid-argument',
        'Estabelecimento obrigatório'
      );
    }

    if (!responsavelNome) {
      throw new HttpsError(
        'invalid-argument',
        'Nome obrigatório'
      );
    }

    if (!pixChave) {
      throw new HttpsError(
        'invalid-argument',
        'PIX obrigatório'
      );
    }

    // =========================
    // BUSCA ESTABELECIMENTO
    // =========================
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

    const est = snap.data();

    // =========================
    // SEGURANÇA
    // =========================
    if (est?.adminId !== req.auth.uid) {
      throw new HttpsError(
        'permission-denied',
        'Sem permissão'
      );
    }

    // =========================
    // VALIDAÇÃO PIX BACKEND
    // =========================
    const pix = pixChave.trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    let tipoFinal = pixTipo;

    if (emailRegex.test(pix)) {
      tipoFinal = 'email';
    } else if (pix.replace(/\D/g, '').length === 11) {
      tipoFinal = 'cpf';
    } else if (pix.replace(/\D/g, '').length >= 10) {
      tipoFinal = 'telefone';
    } else if (pix.length >= 20) {
      tipoFinal = 'aleatoria';
    } else {
      throw new HttpsError(
        'invalid-argument',
        'PIX inválido'
      );
    }

    // =========================
    // SALVAR
    // =========================
    await ref.update({

      responsavelNome,
      responsavelCpf: responsavelCpf || null,
      responsavelTelefone: responsavelTelefone || null,
      responsavelEmail: responsavelEmail || null,

      pixChave: pix,
      pixTipo: tipoFinal,

      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      pixTipo: tipoFinal
    };
  }
);