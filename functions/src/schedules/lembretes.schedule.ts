import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

import { db } from '../config/firebase';
import { REGION } from '../config/region';
import { dataKey, gerarSlots } from '../utils/helpers';

// ─────────────────────────────────────────────
// 📌 LEMBRETE DE AGENDAMENTO
// Cria notificação no Firestore.
// O push será enviado pelo trigger aoCriarNotificacao.
// ─────────────────────────────────────────────
export const lembreteAgendamento = onSchedule(
  {
    region: REGION,
    schedule: 'every 30 minutes',
    memory: '256MiB',
    timeoutSeconds: 120,
  },

  async () => {
    const agora = Timestamp.now();

    const snap = await db
      .collection('agendamentos')
      .where('notificado', '==', false)
      .where('notificarEm', '<=', agora)
      .where('status', '==', 'confirmado')
      .limit(150)
      .get();

    if (snap.empty) {
      return;
    }

    const batch = db.batch();

    const expiraData = new Date();
    expiraData.setDate(expiraData.getDate() + 30);

    const expiraNotificacao = Timestamp.fromDate(expiraData);

    for (const doc of snap.docs) {
      const ag = doc.data();

      if (!ag.clienteUid) {
        batch.update(doc.ref, {
          notificado: true,
          notificadoEm: FieldValue.serverTimestamp(),
        });
        continue;
      }

      // 🔔 CLIENTE
      batch.set(db.collection('notificacoes').doc(), {
        tipo: 'cliente',

        clienteId: ag.clienteUid,
        userId: ag.clienteUid,
        adminId: null,

        titulo: '⏰ Horário chegando!',
        mensagem: `Lembrete: ${ag.servicoNome || 'serviço'} às ${ag.horario || ''} em ${ag.estabelecimentoNome || 'seu estabelecimento'}.`,

        agendamentoId: doc.id,
        estabelecimentoId: ag.estabelecimentoId || '',
        estabelecimentoNome: ag.estabelecimentoNome || '',

        clienteNome: ag.clienteNome || '',
        servicoNome: ag.servicoNome || '',
        formaPagamento: ag.formaPagamento || '',

        type: 'REMINDER_CLIENT',

        lida: false,
        apagada: false,

        criadoEm: FieldValue.serverTimestamp(),
        expiraEm: expiraNotificacao,
      });

      // 🔔 ADMIN
      if (ag.adminId) {
        batch.set(db.collection('notificacoes').doc(), {
          tipo: 'admin',

          adminId: ag.adminId,
          userId: ag.adminId,
          clienteId: null,

          titulo: '📅 Atendimento próximo',
          mensagem: `${ag.clienteNome || 'Cliente'} tem ${ag.servicoNome || 'serviço'} às ${ag.horario || ''}.`,

          agendamentoId: doc.id,
          estabelecimentoId: ag.estabelecimentoId || '',
          estabelecimentoNome: ag.estabelecimentoNome || '',

          clienteNome: ag.clienteNome || '',
          servicoNome: ag.servicoNome || '',
          formaPagamento: ag.formaPagamento || '',

          type: 'REMINDER_ADMIN',

          lida: false,
          apagada: false,

          criadoEm: FieldValue.serverTimestamp(),
          expiraEm: expiraNotificacao,
        });
      }

      batch.update(doc.ref, {
        notificado: true,
        notificadoEm: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    console.log(`✅ ${snap.size} lembretes criados`);
  }
);

// ─────────────────────────────────────────────
// ⛔ EXPIRAR AGENDAMENTOS
// Libera horários ocupados de agendamentos vencidos.
// ─────────────────────────────────────────────
export const expirarAgendamentos = onSchedule(
  {
    region: REGION,
    schedule: 'every 5 minutes',
    memory: '256MiB',
    timeoutSeconds: 120,
  },

  async () => {
    const agora = Date.now();

    const pageSize = 500;

    let lastDoc:
      | FirebaseFirestore.QueryDocumentSnapshot
      | undefined;

    while (true) {
     let query = db
  .collection('agendamentos')
  .where('status', '==', 'pendente')
  .limit(pageSize);

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snap = await query.get();

      if (snap.empty) {
        break;
      }

      let batch = db.batch();
      let ops = 0;

      for (const doc of snap.docs) {
        const ag = doc.data();

        if (!ag.data || !ag.horario) {
          continue;
        }

        const [dia, mes, ano] =
          String(ag.data).split('/');

        const [hora, minuto] =
          String(ag.horario).split(':');

        const inicio = new Date(
          Number(ano),
          Number(mes) - 1,
          Number(dia),
          Number(hora),
          Number(minuto || 0)
        );

        if (isNaN(inicio.getTime())) {
          continue;
        }

        const duracao =
          Number(ag.servicoDuracaoMin || 30);

        const fim = new Date(
          inicio.getTime() + duracao * 60000
        );

        if (fim.getTime() <= agora) {
          batch.update(doc.ref, {
            status: 'expirado',
            expiradoEm:
              FieldValue.serverTimestamp(),
            atualizadoEm:
              FieldValue.serverTimestamp(),
          });

          ops++;

          const key = dataKey(ag.data);
          const slots = gerarSlots(
            ag.horario,
            duracao
          );

          for (const horaSlot of slots) {
            batch.delete(
              db
                .collection('horariosOcupados')
                .doc(
                  `${ag.estabelecimentoId}_${key}_${horaSlot}`
                )
            );

            ops++;
          }

          if (
            ag.clienteUid &&
            ag.data &&
            ag.horario
          ) {
            batch.delete(
              db
                .collection('agendamentoLocks')
                .doc(
                  `${ag.clienteUid}_${ag.data}_${ag.horario}`
                )
            );

            ops++;
          }
        }

        if (ops >= 450) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }

      if (ops > 0) {
        await batch.commit();
      }

      lastDoc = snap.docs[snap.docs.length - 1];
    }

    console.log('✅ Expiração de agendamentos concluída');
  }
);