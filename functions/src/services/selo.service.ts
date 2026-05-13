import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

export const solicitarSelo = onCall(
  { region: REGION },

  async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Acesso negado'
      );
    }

    const { estabelecimentoId } = req.data || {};

    if (!estabelecimentoId) {
      throw new HttpsError(
        'invalid-argument',
        'Estabelecimento obrigatório'
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

    if (est.verificado === true) {
      throw new HttpsError(
        'already-exists',
        'Este estabelecimento já possui selo verificado'
      );
    }

    if (est.solicitacaoSeloStatus === 'pendente') {
      throw new HttpsError(
        'already-exists',
        'Já existe uma solicitação em análise'
      );
    }

    if (est.plano !== 'pro') {
      throw new HttpsError(
        'failed-precondition',
        'Somente o plano Pro pode solicitar selo manualmente'
      );
    }

    if (est.assinaturaAtiva !== true) {
      throw new HttpsError(
        'failed-precondition',
        'Assinatura inativa'
      );
    }

    const totalAtendimentos =
      Number(est.quantidadeAvaliacoes || 0);

    const negativas =
      Number(est.avaliacoesNegativas || 0);

    if (totalAtendimentos < 1000) {
      throw new HttpsError(
        'failed-precondition',
        'É necessário ter pelo menos 1.000 atendimentos'
      );
    }

    if (negativas > 0) {
      throw new HttpsError(
        'failed-precondition',
        'Não pode haver avaliações negativas'
      );
    }

    const solicitacaoRef = db
      .collection('solicitacoesVerificacao')
      .doc();

    const batch = db.batch();

    batch.set(solicitacaoRef, {
      estabelecimentoId,
      adminId: req.auth.uid,

      status: 'pendente',

      plano: est.plano,
      estabelecimentoNome: est.nome || '',
      totalAtendimentos,
      avaliacoesNegativas: negativas,

      taxa: 14.9,
      pago: false,

      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
    });

    batch.update(ref, {
      solicitacaoSeloStatus: 'pendente',
      solicitacaoSeloId: solicitacaoRef.id,
      solicitacaoSeloCriadaEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return {
      ok: true,
      solicitacaoId: solicitacaoRef.id,
      status: 'pendente',
    };
  }
);