import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

import { db } from '../config/firebase';
import { REGION } from '../config/region';
import { enviarPush, getTokenUsuario } from '../services/notificacao.service';
import { dataKey, gerarSlots } from '../utils/helpers';

// ─────────────────────────────────────────────
// 📌 LEMBRETE
// ─────────────────────────────────────────────
export const lembreteAgendamento = onSchedule(
  {
    region: REGION,
    schedule: "every 30 minutes",
    memory: "256MiB",
    timeoutSeconds: 120,
  },
  async () => {

    const agora = Timestamp.now();

    const snap = await db.collection('agendamentos')
      .where('notificado', '==', false)
      .where('notificarEm', '<=', agora)
      .where('status', '==', 'confirmado')
      .limit(150)
      .get();

    if (snap.empty) return;

    const batch = db.batch();
    const pushPromises: Promise<any>[] = [];

    const expiraData = new Date();
    expiraData.setDate(expiraData.getDate() + 30);
    const expiraNotificacao = Timestamp.fromDate(expiraData);

    for (const doc of snap.docs) {
      const ag = doc.data();

      // 💾 SALVA NOTIFICAÇÃO
      batch.set(db.collection('notificacoes').doc(), {
        clienteId: ag.clienteUid,
        adminId: ag.adminId || null,

        titulo: '⏰ Horário chegando!',
        mensagem: `Lembrete: ${ag.servicoNome} às ${ag.horario} em ${ag.estabelecimentoNome || 'seu estabelecimento'}.`,

        agendamentoId: doc.id,
        type: 'REMINDER',

        lida: false,
        apagada: false,

        criadoEm: FieldValue.serverTimestamp(),
        expiraEm: expiraNotificacao,
      });

      // 🔄 MARCA COMO NOTIFICADO
      batch.update(doc.ref, {
        notificado: true,
        notificadoEm: FieldValue.serverTimestamp(),
      });

      // 🔥 PUSH NOTIFICAÇÃO
      if (ag.clienteUid) {
        pushPromises.push(
          (async () => {
            const tokens = await getTokenUsuario(ag.clienteUid, 'cliente');

            if (tokens.length > 0) {
              await enviarPush(
  tokens,
  '⏰ Horário chegando!',
  `Lembrete: ${ag.servicoNome} às ${ag.horario}`,
  {
    type: 'REMINDER',
    agendamentoId: doc.id,
  }
);
            }
          })()
        );
      }
    }

    await batch.commit();
    await Promise.allSettled(pushPromises);

    console.log(`✅ ${snap.size} lembretes enviados`);
  }
);

// ─────────────────────────────────────────────
// ⛔ EXPIRAÇÃO
// ─────────────────────────────────────────────
export const expirarAgendamentos = onSchedule(
  {
    region: REGION,
    schedule: "every 5 minutes",
    memory: "256MiB",
  },
  async () => {

    const agora = Date.now();

    const pageSize = 500;
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

    while (true) {

      let query = db.collection('agendamentos')
        .where('status', 'in', ['confirmado', 'pendente'])
        .limit(pageSize);

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snap = await query.get();

      if (snap.empty) break;

      let batch = db.batch();
      let ops = 0;

      for (const doc of snap.docs) {
        const ag = doc.data();

        if (!ag.data || !ag.horario) continue;

        const [dia, mes, ano] = ag.data.split('/');
        const [hora, minuto] = ag.horario.split(':');

        const inicio = new Date(
          Number(ano),
          Number(mes) - 1,
          Number(dia),
          Number(hora),
          Number(minuto || 0)
        );

        const duracao = ag.servicoDuracaoMin || 30;
        const fim = new Date(inicio.getTime() + duracao * 60000);

        if (fim.getTime() <= agora) {

          batch.update(doc.ref, {
            status: 'expirado',
            expiradoEm: FieldValue.serverTimestamp(),
          });

          const key = dataKey(ag.data);
          const slots = gerarSlots(ag.horario, duracao);

          for (const hora of slots) {
            batch.delete(
              db.collection('horariosOcupados')
                .doc(`${ag.estabelecimentoId}_${key}_${hora}`)
            );
            ops++;
          }

          batch.delete(
            db.collection('agendamentoLocks')
              .doc(`${ag.clienteUid}_${ag.data}_${ag.horario}`)
          );

          ops += 2;
        }

        ops++;

        if (ops >= 450) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }

      await batch.commit();

      lastDoc = snap.docs[snap.docs.length - 1];
    }
  }
);