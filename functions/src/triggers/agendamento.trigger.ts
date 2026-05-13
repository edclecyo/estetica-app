import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

import {
  enviarPush,
  getTokenUsuario,
} from '../services/notificacao.service';

const NOTIF_TYPES = {
  CONFIRMADO: 'NEW_SLOT',
  CANCELADO: 'GENERAL',
  CONCLUIDO: 'APPOINTMENT_DONE',
} as const;

async function alreadyProcessed(
  id: string,
  status: string
): Promise<boolean> {
  const ref = db
    .collection('eventLocks')
    .doc(`${id}_${status}`);

  try {
    await ref.create({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return false;
  } catch {
    return true;
  }
}

function buildNotification(
  status: string,
  servicoNome?: string
) {
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

export const onAgendamentoUpdate = onDocumentUpdated(
  {
    document: 'agendamentos/{docId}',
    region: REGION,
  },

  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const id = event.params.docId;

    if (!before || !after) {
      return;
    }

    const statusChanged =
      before.status !== after.status &&
      after.status != null;

    if (!statusChanged) {
      return;
    }

    const processed = await alreadyProcessed(
      id,
      after.status
    );

    if (processed) {
      return;
    }

    const notif = buildNotification(
      after.status,
      after.servicoNome
    );

    if (!notif || !after.clienteUid) {
      return;
    }

    const tokens = await getTokenUsuario(
      after.clienteUid,
      'cliente'
    );

    if (tokens.length > 0) {
      await enviarPush(
        tokens,
        notif.titulo,
        notif.mensagem,
        {
          type: notif.type,
          agendamentoId: id,
          estabelecimentoId: after.estabelecimentoId || '',
        }
      );
    }

    await db.collection('notificacoes').add({
      tipo: 'cliente',

      clienteId: after.clienteUid,
      userId: after.clienteUid,

      adminId: after.adminId || null,

      agendamentoId: id,

      estabelecimentoId: after.estabelecimentoId || '',
      estabelecimentoNome: after.estabelecimentoNome || '',

      clienteNome: after.clienteNome || '',
      servicoNome: after.servicoNome || '',
      formaPagamento: after.formaPagamento || '',

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
);