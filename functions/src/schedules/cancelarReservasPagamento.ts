import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { db } from '../config/firebase';
import { REGION } from '../config/region';
import { dataKey, gerarSlots } from '../utils/helpers';

function liberarHorarioReserva(
  ag: any,
  t: FirebaseFirestore.Transaction
) {
  const key = ag.dataKey || dataKey(ag.data);
  const duracao = Number(
    ag.servicoDuracaoMin ||
    ag.duracao ||
    30
  );
  const intervalo = Number(ag.intervaloMin || 30);
  const slots = gerarSlots(ag.horario, duracao, intervalo);

  t.delete(
    db.collection('agendamentoLocks')
      .doc(`${ag.clienteUid}_${ag.data}_${ag.horario}`)
  );

  t.delete(
    db.collection('agendamentoLocks')
      .doc(`${ag.estabelecimentoId}_${key}_${ag.horario}`)
  );

  if (ag.id) {
    t.delete(
      db.collection('agendamentoLocks')
        .doc(String(ag.id))
    );
  }

  for (const horario of slots) {
    t.delete(
      db.collection('horariosOcupados')
        .doc(`${ag.estabelecimentoId}_${key}_${horario}`)
    );
  }
}

export const cancelarReservasPagamento = onSchedule(
  {
    region: REGION,
    schedule: 'every 1 minutes',
    timeZone: 'America/Sao_Paulo',
    memory: '256MiB',
    timeoutSeconds: 180,
  },
  async () => {
    const agora = Timestamp.now();

    const snap = await db
      .collection('agendamentos')
      .where('status', '==', 'aguardando_pagamento')
      .where('pagamentoExpiraEm', '<=', agora)
      .limit(100)
      .get();

    if (snap.empty) {
      console.log('Nenhuma reserva de pagamento vencida.');
      return;
    }

    let total = 0;

    for (const doc of snap.docs) {
      const cancelou = await db.runTransaction(async (t) => {
        const atualSnap = await t.get(doc.ref);

        if (!atualSnap.exists) {
          return false;
        }

        const ag = atualSnap.data() as any;
        const expiraMs = ag.pagamentoExpiraEm?.toMillis?.() || 0;

        if (
          ag.status !== 'aguardando_pagamento' ||
          ag.statusPagamento === 'approved' ||
          !expiraMs ||
          expiraMs > Date.now()
        ) {
          return false;
        }

        t.update(doc.ref, {
          status: 'cancelado',
          statusPagamento: 'expired',
          pixStatus: 'expired',
          reservaTemporaria: false,
          horarioLiberado: true,
          podeApagarCliente: true,
          pagamentoExpirado: true,
          canceladoAutomaticamente: true,
          cancelamentoMotivo:
            'Pagamento nao confirmado dentro de 15 minutos.',
          canceladoEm: FieldValue.serverTimestamp(),
          atualizadoEm: FieldValue.serverTimestamp(),
        });

        liberarHorarioReserva({ id: doc.id, ...ag }, t);

        const notifRef = db
          .collection('notificacoes')
          .doc(`agendamento_${doc.id}_cliente_pagamento_expirado`);

        t.set(notifRef, {
          clienteId: ag.clienteUid,
          userId: ag.clienteUid,
          tipo: 'cliente',
          type: 'PAGAMENTO_EXPIRADO',
          dedupeKey: `agendamento:${doc.id}:cliente:pagamento-expirado`,
          agendamentoId: doc.id,
          estabelecimentoId: ag.estabelecimentoId || '',
          estabelecimentoNome: ag.estabelecimentoNome || '',
          clienteNome: ag.clienteNome || '',
          servicoNome: ag.servicoNome || '',
          data: ag.data || '',
          horario: ag.horario || '',
          formaPagamento: ag.formaPagamento || '',
          titulo: 'Reserva expirada',
          mensagem:
            'A reserva foi cancelada porque o comprovante nao foi confirmado dentro de 15 minutos. Voce pode escolher um novo horario e tentar novamente.',
          lida: false,
          apagada: false,
          criadoEm: FieldValue.serverTimestamp(),
        });

        return true;
      });

      if (cancelou) {
        total++;

        const pagamentosSnap = await db
          .collection('pagamentos')
          .where('agendamentoId', '==', doc.id)
          .limit(10)
          .get();

        if (!pagamentosSnap.empty) {
          const batch = db.batch();

          for (const pagamentoDoc of pagamentosSnap.docs) {
            if (pagamentoDoc.data()?.status === 'approved') {
              continue;
            }

            batch.update(pagamentoDoc.ref, {
              status: 'expired',
              atualizadoEm: FieldValue.serverTimestamp(),
            });
          }

          await batch.commit();
        }
      }
    }

    console.log(`${total} reservas de pagamento canceladas por expiracao.`);
  }
);
