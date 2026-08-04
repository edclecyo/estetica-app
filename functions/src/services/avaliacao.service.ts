import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

export const avaliarAgendamento = onCall(
  { region: REGION },

  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Faça login');
    }

    const {
      agendamentoId,
      estrelas,
      tags = [],
    } = req.data || {};

    if (!agendamentoId) {
      throw new HttpsError(
        'invalid-argument',
        'Agendamento obrigatório'
      );
    }

    const nota = Number(estrelas);

    if (!nota || nota < 1 || nota > 5) {
      throw new HttpsError(
        'invalid-argument',
        'Nota inválida'
      );
    }

    const clienteUid = req.auth.uid;

    const agRef = db
      .collection('agendamentos')
      .doc(agendamentoId);

    const notifQuery = db
      .collection('notificacoes')
      .where('agendamentoId', '==', agendamentoId)
      .where('clienteId', '==', clienteUid)
      .where('type', '==', 'APPOINTMENT_DONE');

    return await db.runTransaction(async (t) => {
      const [agSnap, notifSnap] = await Promise.all([
        t.get(agRef),
        t.get(notifQuery),
      ]);

      if (!agSnap.exists) {
        throw new HttpsError(
          'not-found',
          'Agendamento não encontrado'
        );
      }

      const ag = agSnap.data()!;

      if (ag.clienteUid !== clienteUid) {
        throw new HttpsError(
          'permission-denied',
          'Sem permissão'
        );
      }

      if (ag.status !== 'concluido') {
        throw new HttpsError(
          'failed-precondition',
          'Só é possível avaliar atendimentos concluídos'
        );
      }

      if (ag.avaliacao) {
        throw new HttpsError(
          'already-exists',
          'Este atendimento já foi avaliado'
        );
      }

      const estabelecimentoId = ag.estabelecimentoId;

      if (!estabelecimentoId) {
        throw new HttpsError(
          'failed-precondition',
          'Estabelecimento inválido'
        );
      }

      const estRef = db
        .collection('estabelecimentos')
        .doc(estabelecimentoId);

      const estSnap = await t.get(estRef);

      if (!estSnap.exists) {
        throw new HttpsError(
          'not-found',
          'Estabelecimento não encontrado'
        );
      }

      const est = estSnap.data() || {};

      const totalAtual =
        Number(est.totalAvaliacoes || est.quantidadeAvaliacoes || 0);

      const somaAtual =
        Number(est.somaAvaliacoes || 0);

      const positivasAtual =
        Number(est.avaliacoesPositivas || 0);

      const negativasAtual =
        Number(est.avaliacoesNegativas || 0);

      const novoTotal = totalAtual + 1;
      const novaSoma = somaAtual + nota;

      const novaMedia = Number(
        (novaSoma / novoTotal).toFixed(1)
      );

      const positiva = nota >= 4;
      const negativa = nota <= 2;

      const novasPositivas =
        positivasAtual + (positiva ? 1 : 0);

      const novasNegativas =
        negativasAtual + (negativa ? 1 : 0);

      let nivelReputacao:
        | 'excelente'
        | 'boa'
        | 'regular'
        | 'ruim' = 'regular';

      if (novaMedia >= 4.7 && novasNegativas <= 3) {
        nivelReputacao = 'excelente';
      } else if (novaMedia >= 4.0) {
        nivelReputacao = 'boa';
      } else if (novaMedia >= 3.0) {
        nivelReputacao = 'regular';
      } else {
        nivelReputacao = 'ruim';
      }

      t.update(agRef, {
        avaliacao: nota,

        detalhesAvaliacao: {
          tags: Array.isArray(tags) ? tags : [],
          criadoEm: FieldValue.serverTimestamp(),
        },

        deletado: true,
        avaliadoEm: FieldValue.serverTimestamp(),
        atualizadoEm: FieldValue.serverTimestamp(),
      });

      t.update(estRef, {
        avaliacao: novaMedia,
        somaAvaliacoes: novaSoma,
        quantidadeAvaliacoes: novoTotal,
        totalAvaliacoes: novoTotal,

        avaliacoesPositivas: novasPositivas,
        avaliacoesNegativas: novasNegativas,

        nivelReputacao,

        atualizadoEm: FieldValue.serverTimestamp(),
      });

      t.set(db.collection('avaliacoes').doc(), {
        agendamentoId,
        estabelecimentoId,
        clienteUid,

        estrelas: nota,
        tags: Array.isArray(tags) ? tags : [],

        positiva,
        negativa,

        nivelReputacaoGerado: nivelReputacao,

        estabelecimentoNome:
          ag.estabelecimentoNome || '',

        servicoNome:
          ag.servicoNome || '',

        clienteNome:
          ag.clienteNome || '',

        criadoEm: FieldValue.serverTimestamp(),
      });

      notifSnap.docs.forEach((doc) => {
        t.update(doc.ref, {
          lida: true,
          apagada: true,
          removidaPorAvaliacao: true,
          removidaEm: FieldValue.serverTimestamp(),
        });
      });

      return {
        ok: true,
        avaliacao: novaMedia,
        nivelReputacao,
      };
    });
  }
);
