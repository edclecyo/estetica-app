import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { REGION } from '../config/region';
import { enviarPush, getTokenUsuario } from '../services/notificacao.service';

const NOTIF_TYPES = {
  CONFIRMADO: 'NEW_SLOT',
  CANCELADO: 'GENERAL',
  CONCLUIDO: 'APPOINTMENT_DONE',
} as const;

// 🔐 IDPOTÊNCIA
async function alreadyProcessed(id: string, status: string) {
  const ref = db.collection('eventLocks').doc(`${id}_${status}`);

  try {
    await ref.create({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return false;
  } catch {
    return true;
  }
}

// 🔔 BUILDER
function buildNotification(status: string, servicoNome: string) {
  switch (status) {
    case 'confirmado':
      return {
        type: NOTIF_TYPES.CONFIRMADO,
        titulo: 'Agendamento Confirmado',
        mensagem: `Seu agendamento de ${servicoNome || 'serviço'} foi confirmado.`,
      };

    case 'cancelado':
      return {
        type: NOTIF_TYPES.CANCELADO,
        titulo: 'Agendamento Cancelado',
        mensagem: `Seu agendamento de ${servicoNome || 'serviço'} foi cancelado.`,
      };

    case 'concluido':
      return {
        type: NOTIF_TYPES.CONCLUIDO,
        titulo: 'Atendimento Concluído',
        mensagem: `Seu serviço de ${servicoNome || 'serviço'} foi concluído.`,
      };

    default:
      return null;
  }
}

// ⭐ RANKING
async function updateRanking(estId: string, oldNota: number | null, newNota: number) {
  const estRef = db.collection('estabelecimentos').doc(estId);

  await db.runTransaction(async (t) => {
    const snap = await t.get(estRef);
    if (!snap.exists) return;

    const d = snap.data() || {};

    const totalAtual = d.quantidadeAvaliacoes || 0;
    const somaAtual = d.somaNotas || 0;

    const isUpdate = oldNota != null;

    const quantidadeAvaliacoes = isUpdate ? totalAtual : totalAtual + 1;

    const somaNotas = isUpdate
      ? somaAtual - oldNota + newNota
      : somaAtual + newNota;

    const media = somaNotas / Math.max(quantidadeAvaliacoes, 1);

    t.update(estRef, {
      avaliacao: Math.round(media * 10) / 10,
      quantidadeAvaliacoes,
      somaNotas,
      rankingScore: (media * 2) + (quantidadeAvaliacoes * 0.5),
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

// 🚀 TRIGGER PRINCIPAL
export const onAgendamentoUpdate = onDocumentUpdated(
  { document: 'agendamentos/{docId}', region: REGION },
  async (event) => {

    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const id = event.params.docId;

    if (!before || !after) return;

    const statusChanged = before.status !== after.status;

    // 🔐 evita duplicação
    if (statusChanged) {
      const processed = await alreadyProcessed(id, after.status);
      if (processed) return;
    }

    // 🔔 NOTIFICAÇÃO
    if (statusChanged) {
      const notif = buildNotification(after.status, after.servicoNome);

      if (notif && after.clienteUid) {

        // 🔥 PUSH (CORRIGIDO)
        const tokens = await getTokenUsuario(after.clienteUid, 'cliente');

        if (tokens.length > 0) {
          await enviarPush(
  tokens,
  notif.titulo,
  notif.mensagem,
  {
    type: notif.type,
    agendamentoId: id,
  }
);
        }

        // 💾 SALVA NOTIFICAÇÃO
        await db.collection('notificacoes').add({
          clienteId: after.clienteUid,
          adminId: after.adminId || null,

          agendamentoId: id,
          estabelecimentoId: after.estabelecimentoId,
          estabelecimentoNome: after.estabelecimentoNome,

          titulo: notif.titulo,
          mensagem: notif.mensagem,
          type: notif.type,

          lida: false,
          apagada: false,
          processedByTrigger: true,

          criadoEm: admin.firestore.FieldValue.serverTimestamp(),

          expiraEm: admin.firestore.Timestamp.fromDate(
            new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
          ),
        });
      }
    }

    // ⭐ RANKING
    const notaNova = after.avaliacaoCliente;
    const notaAntiga = before.avaliacaoCliente;

    const mudouAvaliacao =
      after.status === 'concluido' &&
      notaNova != null &&
      (notaAntiga == null || notaAntiga !== notaNova);

    if (mudouAvaliacao) {
      await updateRanking(
        after.estabelecimentoId,
        notaAntiga ?? null,
        notaNova
      );
    }
  }
);