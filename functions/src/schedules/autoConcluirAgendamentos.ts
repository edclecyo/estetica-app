import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue } from 'firebase-admin/firestore';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

function parseDataHora(
  data: string,
  horario: string
): Date | null {
  const [dia, mes, ano] = String(data).split('/').map(Number);
  const [hora, minuto] = String(horario).split(':').map(Number);

  if (
    !dia ||
    !mes ||
    !ano ||
    !Number.isInteger(hora) ||
    !Number.isInteger(minuto) ||
    hora < 0 ||
    hora > 23 ||
    minuto < 0 ||
    minuto > 59
  ) {
    return null;
  }

  // Agendamento chega como data/hora brasileira (UTC-3).
  const d = new Date(Date.UTC(
    ano,
    mes - 1,
    dia,
    hora + 3,
    minuto,
    0,
    0
  ));

  if (isNaN(d.getTime())) return null;

  return d;
}

export const autoConcluirAgendamentos = onSchedule(
  {
    region: REGION,
    schedule: 'every 15 minutes',
    timeZone: 'America/Sao_Paulo',
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  async () => {
    const agora = new Date();

    const snap = await db
      .collection('agendamentos')
      .where('status', '==', 'confirmado')
      .limit(300)
      .get();

    if (snap.empty) {
      console.log('Nenhum agendamento confirmado.');
      return;
    }

    const batch = db.batch();
    let total = 0;

    for (const doc of snap.docs) {
      const ag = doc.data();

      if (!ag.data || !ag.horario) continue;

      const inicioAgendamento = parseDataHora(
        ag.data,
        ag.horario
      );

      if (!inicioAgendamento) continue;

      const duracaoMin = Number(
        ag.servicoDuracaoMin ||
        ag.duracao ||
        60
      );

      const fimAgendamento = new Date(
        inicioAgendamento.getTime() +
          duracaoMin * 60 * 1000
      );

      if (agora.getTime() < fimAgendamento.getTime()) {
        continue;
      }

      batch.update(doc.ref, {
        status: 'concluido',
        concluidoAutomaticamente: true,
        concluidoEm: FieldValue.serverTimestamp(),
        atualizadoEm: FieldValue.serverTimestamp(),
      });

      total++;
    }

    if (total > 0) {
      await batch.commit();
    }

    console.log(
      `${total} agendamentos concluidos automaticamente apos finalizacao`
    );
  }
);
