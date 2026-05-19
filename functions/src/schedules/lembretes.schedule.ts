
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

export const lembreteAgendamento = onSchedule(
  {
    region: REGION,
    schedule: 'every 60 minutes',
    timeZone: 'America/Fortaleza',
    memory: '256MiB',
    timeoutSeconds: 120,
  },

  async () => {
    const agora = new Date();

const alvoInicio =
  new Date(agora.getTime() + 55 * 60 * 1000);

const alvoFim =
  new Date(agora.getTime() + 65 * 60 * 1000);

    const snap = await db
      .collection('agendamentos')
      .where('notificado', '==', false)
      .where('status', '==', 'confirmado')
      .limit(300)
      .get();

    if (snap.empty) return;

    const batch = db.batch();

    const expiraData = new Date();
    expiraData.setDate(expiraData.getDate() + 30);
    const expiraNotificacao = Timestamp.fromDate(expiraData);

    let total = 0;

    for (const doc of snap.docs) {
      const ag = doc.data();

      if (!ag.data || !ag.horario) continue;

      const [dia, mes, ano] = String(ag.data).split('/');
      const [hora, minuto] = String(ag.horario).split(':');

      const inicioAgendamento = new Date(
        Number(ano),
        Number(mes) - 1,
        Number(dia),
        Number(hora),
        Number(minuto || 0)
      );

      if (isNaN(inicioAgendamento.getTime())) continue;

      const dentroDaJanela =
  inicioAgendamento >= alvoInicio &&
  inicioAgendamento <= alvoFim;

      if (!dentroDaJanela) continue;

      if (!ag.clienteUid) {
        batch.update(doc.ref, {
          notificado: true,
          notificadoEm: FieldValue.serverTimestamp(),
        });
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
    }

    if (total > 0) {
      await batch.commit();
    }

    console.log(`✅ ${total} lembretes criados`);
  }
);