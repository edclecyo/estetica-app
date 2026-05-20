import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

export const gerarSimulacaoIA = onCall(
  {
    region: REGION,
    memory: '512MiB',
    timeoutSeconds: 120,
  },

  async req => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Faça login');
    }

    const { estabelecimentoId, categoria, imagemUrl } = req.data || {};

    if (!estabelecimentoId || !categoria || !imagemUrl) {
      throw new HttpsError(
        'invalid-argument',
        'Dados obrigatórios ausentes'
      );
    }

    const estSnap = await db
      .collection('estabelecimentos')
      .doc(estabelecimentoId)
      .get();

    if (!estSnap.exists) {
      throw new HttpsError(
        'not-found',
        'Estabelecimento não encontrado'
      );
    }

    const est = estSnap.data() as any;

    if (
      est.plano !== 'elite' ||
      est.assinaturaAtiva !== true ||
      est.iaSimulacaoAtiva !== true
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Prévia IA disponível apenas para Elite com adicional IA ativo.'
      );
    }

    const agora = new Date();

    const mesKey =
      `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;

    const limite = Number(est.iaSimulacaoLimiteMensal || 2);

    const limiteRef = db
      .collection('limitesIA')
      .doc(`${req.auth.uid}_${estabelecimentoId}_${mesKey}`);

    await db.runTransaction(async t => {
      const snap = await t.get(limiteRef);

      const atual = snap.exists
        ? Number(snap.data()?.total || 0)
        : 0;

      if (atual >= limite) {
        throw new HttpsError(
          'resource-exhausted',
          `Você atingiu o limite mensal de ${limite} simulações IA.`
        );
      }

      t.set(
        limiteRef,
        {
          clienteUid: req.auth.uid,
          estabelecimentoId,
          mes: mesKey,
          total: atual + 1,
          limite,
          atualizadoEm: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    // MVP: por enquanto retorna a imagem original.
    // Depois aqui entra a IA real.
    const imagemGerada = imagemUrl;

    const simRef = await db.collection('simulacoesIA').add({
      clienteUid: req.auth.uid,
      estabelecimentoId,
      categoria,

      imagemOriginal: imagemUrl,
      imagemGerada,

      mesKey,
      criadoEm: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      simulacaoId: simRef.id,
      imagemGerada,
      limiteMensal: limite,
    };
  }
);