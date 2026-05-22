
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { db } from '../config/firebase';
import { REGION } from '../config/region';
import { parseDataHoraBR } from '../utils/helpers';

const UMA_HORA_MS = 60 * 60 * 1000;

export const lembreteAgendamento = onSchedule(
  {
    region: REGION,
    schedule: 'every 60 minutes',
    timeZone: 'America/Sao_Paulo',
    memory: '256MiB',
    timeoutSeconds: 120,
  },

  async () => {
    const agora = new Date();

    const inicioJanela = Timestamp.fromDate(
      new Date(agora.getTime() - UMA_HORA_MS)
    );
    const fimJanela = Timestamp.fromDate(agora);

    const snap = await db
      .collection('agendamentos')
      .where('notificarEm', '>=', inicioJanela)
      .where('notificarEm', '<', fimJanela)
      .limit(300)
      .get();

    if (snap.empty) return;

    const batch = db.batch();

    const expiraData = new Date();
    expiraData.setDate(expiraData.getDate() + 30);
    const expiraNotificacao = Timestamp.fromDate(expiraData);

    let total = 0;
    let atualizados = 0;

    for (const doc of snap.docs) {
      const ag = doc.data();

      if (
        ag.status !== 'confirmado' ||
        ag.notificado === true ||
        !ag.data ||
        !ag.horario
      ) {
        continue;
      }

      let inicioAgendamento: Date;

      try {
        inicioAgendamento = parseDataHoraBR(
          String(ag.data),
          String(ag.horario)
        );
      } catch {
        continue;
      }

      const agendamentoAindaVaiComecar =
        inicioAgendamento.getTime() > agora.getTime();

      if (!agendamentoAindaVaiComecar) {
        continue;
      }

      if (!ag.clienteUid) {
        batch.update(doc.ref, {
          notificado: true,
          notificadoEm: FieldValue.serverTimestamp(),
        });
        atualizados++;
        continue;
      }

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

      total++;
      atualizados++;
    }

    if (atualizados > 0) {
      await batch.commit();
    }

    console.log(`✅ ${total} lembretes criados`);
  }
);
