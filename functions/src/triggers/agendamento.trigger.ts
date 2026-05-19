import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

const NOTIF_TYPES = {
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
    case 'cancelado':
      return {
        type: NOTIF_TYPES.CANCELADO,
        titulo: 'Agendamento cancelado',
        mensagem: `Seu agendamento de ${servicoNome || 'serviço'} foi cancelado.`,
      };

    case 'concluido':
      return {
        type: NOTIF_TYPES.CONCLUIDO,
        titulo: 'Atendimento concluído',
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

  async event => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const id = event.params.docId;

    if (!before || !after) return;

    if (before.status === after.status) return;

    // confirmado já é criado dentro de criarAgendamento
    if (after.status === 'confirmado') return;

    const notif = buildNotification(
      after.status,
      after.servicoNome
    );

    if (!notif || !after.clienteUid) return;

    const processed = await alreadyProcessed(
      id,
      after.status
    );

    if (processed) return;

    await db
      .collection('notificacoes')
      .doc(`agendamento_${id}_cliente_${after.status}`)
      .set({
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
        dedupeKey: `agendamento:${id}:cliente:${after.status}`,

        lida: false,
        apagada: false,

        processedByTrigger: true,

        criadoEm: admin.firestore.FieldValue.serverTimestamp(),

        expiraEm: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
        ),
      }, { merge: true });
  }
);