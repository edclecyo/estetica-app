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

   if (est.plano === 'elite') {
  throw new HttpsError(
    'already-exists',
    'O plano Elite já possui selo automático'
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

export const responderSolicitacaoSelo = onCall(
  { region: REGION },

  async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Acesso negado'
      );
    }

    const { solicitacaoId, aprovado, motivo } = req.data || {};

    if (!solicitacaoId || typeof aprovado !== 'boolean') {
      throw new HttpsError(
        'invalid-argument',
        'Dados inválidos'
      );
    }

    const adminSnap = await db
      .collection('admins')
      .doc(req.auth.uid)
      .get();

    const adminData = adminSnap.data();

    if (adminData?.cargo !== 'Super Admin') {
      throw new HttpsError(
        'permission-denied',
        'Apenas Super Admin pode responder'
      );
    }

    const solicitacaoRef = db
      .collection('solicitacoesVerificacao')
      .doc(solicitacaoId);

    const solicitacaoSnap = await solicitacaoRef.get();

    if (!solicitacaoSnap.exists) {
      throw new HttpsError(
        'not-found',
        'Solicitação não encontrada'
      );
    }

    const solicitacao = solicitacaoSnap.data()!;

    if (solicitacao.status !== 'pendente') {
      throw new HttpsError(
        'failed-precondition',
        'Solicitação já respondida'
      );
    }

    const estRef = db
      .collection('estabelecimentos')
      .doc(solicitacao.estabelecimentoId);

    const batch = db.batch();

    if (aprovado) {
      batch.update(solicitacaoRef, {
        status: 'aprovado',
        aprovado: true,
        aprovadoPor: req.auth.uid,
        aprovadoEm: FieldValue.serverTimestamp(),
        motivo: motivo || 'Aprovado pelo Super Admin',
        pagamentoStatus: 'aguardando_pagamento',
        atualizadoEm: FieldValue.serverTimestamp(),
      });

      batch.update(estRef, {
        solicitacaoSeloStatus: 'aprovado',
        solicitacaoSeloAprovadaEm: FieldValue.serverTimestamp(),
        seloTaxaPaga: false,
        atualizadoEm: FieldValue.serverTimestamp(),
      });

      batch.set(db.collection('notificacoes').doc(), {
        tipo: 'admin',
        type: 'SELO_APROVADO',
        adminId: solicitacao.adminId,
        userId: solicitacao.adminId,
        estabelecimentoId: solicitacao.estabelecimentoId,
        estabelecimentoNome: solicitacao.estabelecimentoNome || '',
        solicitacaoId,
        titulo: 'Selo aprovado',
        mensagem:
          'Sua solicitação de selo foi aprovada. Pague a taxa para liberar o selo no estabelecimento.',
        lida: false,
        apagada: false,
        criadoEm: FieldValue.serverTimestamp(),
      });
    } else {
      batch.update(solicitacaoRef, {
        status: 'rejeitado',
        aprovado: false,
        rejeitadoPor: req.auth.uid,
        rejeitadoEm: FieldValue.serverTimestamp(),
        motivo: motivo || 'Não atende os critérios necessários',
        atualizadoEm: FieldValue.serverTimestamp(),
      });

      batch.update(estRef, {
        solicitacaoSeloStatus: 'rejeitado',
        solicitacaoSeloRejeitadaEm: FieldValue.serverTimestamp(),
        atualizadoEm: FieldValue.serverTimestamp(),
      });

      batch.set(db.collection('notificacoes').doc(), {
        tipo: 'admin',
        type: 'SELO_REJEITADO',
        adminId: solicitacao.adminId,
        userId: solicitacao.adminId,
        estabelecimentoId: solicitacao.estabelecimentoId,
        estabelecimentoNome: solicitacao.estabelecimentoNome || '',
        solicitacaoId,
        titulo: 'Selo rejeitado',
        mensagem:
          motivo || 'Sua solicitação de selo foi rejeitada. Revise os critérios e tente novamente.',
        lida: false,
        apagada: false,
        criadoEm: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    return {
      ok: true,
      status: aprovado ? 'aprovado' : 'rejeitado',
    };
  }
);
