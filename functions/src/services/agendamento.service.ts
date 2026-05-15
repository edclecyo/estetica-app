import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { db } from '../config/firebase';
import { REGION } from '../config/region';
import { parseDataHoraBR, planoAtivo, dataKey } from '../utils/helpers';
import { RATE_LIMIT_MS } from '../config/rateLimit';

const toMinutes = (h: string) => {
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + mm;
};

const toHHMM = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const normalizarHorario = (valor: string) => {
  const [hh, mm] = String(valor || '').split(':').map(Number);

  if (
    Number.isNaN(hh) ||
    Number.isNaN(mm) ||
    hh < 0 ||
    hh > 23 ||
    mm < 0 ||
    mm > 59
  ) {
    return '';
  }

  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

const getDiaSemanaBR = (dataBr: string) => {
  const [dia, mes, ano] = String(dataBr).split('/').map(Number);
  const data = new Date(ano, mes - 1, dia);

  if (Number.isNaN(data.getTime())) {
    return '';
  }

  return DIAS_SEMANA[data.getDay()];
};

export const criarAgendamento = onCall(
  {
    region: REGION,
    maxInstances: 50,
  },

  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Acesso negado');
    }

    const clienteUid = request.auth.uid;

    const {
      estabelecimentoId,
      servicoNome,
      clienteNome,
      data: dataBr,
      horario,
      formaPagamento,
    } = request.data || {};

    if (
      !estabelecimentoId ||
      !servicoNome ||
      !clienteNome ||
      !dataBr ||
      !horario
    ) {
      throw new HttpsError(
        'invalid-argument',
        'Campos obrigatórios ausentes'
      );
    }

    const estRef = db
      .collection('estabelecimentos')
      .doc(estabelecimentoId);

    const rateRef = db
      .collection('rateLimit')
      .doc(clienteUid);

    const key = dataKey(dataBr);
    const horarioNormalizado = normalizarHorario(horario);

    let agendamentoId = '';
    let slotsOcupados: string[] = [];

    if (!horarioNormalizado) {
      throw new HttpsError(
        'invalid-argument',
        'Horário inválido'
      );
    }

    await db.runTransaction(async (t) => {
      const [rateSnap, estSnap] = await Promise.all([
        t.get(rateRef),
        t.get(estRef),
      ]);

      if (!estSnap.exists) {
        throw new HttpsError(
          'not-found',
          'Estabelecimento não encontrado'
        );
      }

      const est = estSnap.data();

      if (!est) {
        throw new HttpsError(
          'not-found',
          'Dados do estabelecimento inválidos'
        );
      }

      if (!planoAtivo(est)) {
        throw new HttpsError(
          'failed-precondition',
          'Plano inativo'
        );
      }

      const diasFuncionamento = Array.isArray(est.diasFuncionamento)
        ? est.diasFuncionamento
        : null;

      const diaSemana = getDiaSemanaBR(dataBr);

      if (
        diasFuncionamento &&
        !diasFuncionamento.includes(diaSemana)
      ) {
        throw new HttpsError(
          'failed-precondition',
          'Estabelecimento fechado nesta data'
        );
      }

      const diasFechados = Array.isArray(est.diasFechados)
        ? est.diasFechados
        : [];

      if (diasFechados.includes(dataBr)) {
        throw new HttpsError(
          'failed-precondition',
          'Estabelecimento fechado nesta data'
        );
      }

      const horariosPermitidos = Array.isArray(est.horarios)
        ? est.horarios.map((h: string) => normalizarHorario(h))
        : [];

      if (
        horariosPermitidos.length > 0 &&
        !horariosPermitidos.includes(horarioNormalizado)
      ) {
        throw new HttpsError(
          'failed-precondition',
          'Horário indisponível'
        );
      }

      const horariosBloqueados =
        est.horariosBloqueados &&
        Array.isArray(est.horariosBloqueados[dataBr])
          ? est.horariosBloqueados[dataBr].map((h: string) =>
              normalizarHorario(h)
            )
          : [];

      if (horariosBloqueados.includes(horarioNormalizado)) {
        throw new HttpsError(
          'failed-precondition',
          'Horário bloqueado pelo estabelecimento'
        );
      }

      const now = Date.now();

      if (rateSnap.exists) {
        const last = rateSnap.data()?.timestamp || 0;

        if (now - last < RATE_LIMIT_MS) {
          throw new HttpsError(
            'resource-exhausted',
            'Aguarde antes de agendar novamente.'
          );
        }
      }

      const servicos = Array.isArray(est.servicos)
        ? est.servicos
        : [];

      const servico = servicos.find(
        (s: any) =>
          String(s?.nome || '').trim() ===
          String(servicoNome).trim()
      );

      if (!servico) {
        throw new HttpsError(
          'invalid-argument',
          'Serviço inválido'
        );
      }

      const duracao = Number(servico.duracao || 0);

      if (!duracao) {
        throw new HttpsError(
          'invalid-argument',
          'Serviço sem duração'
        );
      }

      const dataHoraAgendamento = parseDataHoraBR(
        dataBr,
        horarioNormalizado
      );

      const notificarEm = new Date(
        dataHoraAgendamento.getTime() - 60 * 60 * 1000
      );

      const inicioMin = toMinutes(horarioNormalizado);
      const fimMin = inicioMin + duracao;
      const step = Number(est?.intervaloMin || 30);

      slotsOcupados = [];

      for (let m = inicioMin; m < fimMin; m += step) {
        slotsOcupados.push(toHHMM(m));
      }
const conflitoComBloqueio = slotsOcupados.some(slot =>
  horariosBloqueados.includes(slot)
);

if (conflitoComBloqueio) {
  throw new HttpsError(
    'failed-precondition',
    'Horário bloqueado pelo estabelecimento'
  );
}
      const conflitoSnaps = await Promise.all(
        slotsOcupados.map((slot) =>
          t.get(
            db
              .collection('horariosOcupados')
              .doc(`${estabelecimentoId}_${key}_${slot}`)
          )
        )
      );

      const existeConflito = conflitoSnaps.some(
        (s) => s.exists
      );

      if (existeConflito) {
        throw new HttpsError(
          'already-exists',
          'Horário já ocupado'
        );
      }

      const agRef = db.collection('agendamentos').doc();

      agendamentoId = agRef.id;

      const adminId = est?.adminId || '';

      t.set(
        rateRef,
        {
          timestamp: now,
        },
        {
          merge: true,
        }
      );

      t.set(agRef, {
        estabelecimentoId,
        estabelecimentoNome: est?.nome || 'Estabelecimento',

        adminId,

        servicoNome,
        servicoPreco: Number(servico.preco || 0),
        servicoDuracaoMin: duracao,
        duracao,

        intervaloMin: Number(est?.intervaloMin || 30),

        clienteNome,
        clienteUid,

        data: dataBr,
        dataKey: key,
        horario: horarioNormalizado,

        status: 'confirmado',

        formaPagamento: formaPagamento || 'local',

        notificado: false,
        notificarEm: Timestamp.fromDate(notificarEm),

        criadoEm: FieldValue.serverTimestamp(),
        atualizadoEm: FieldValue.serverTimestamp(),
      });

      for (const slot of slotsOcupados) {
        t.set(
          db
            .collection('horariosOcupados')
            .doc(`${estabelecimentoId}_${key}_${slot}`),
          {
            estabelecimentoId,
            estabelecimentoNome: est?.nome || '',

            adminId,

            agendamentoId,

            clienteUid,
            clienteNome,

            servicoNome,

            data: dataBr,
            dataKey: key,
            horario: slot,

            criadoEm: FieldValue.serverTimestamp(),
          }
        );
      }

      const notifClienteRef = db
        .collection('notificacoes')
        .doc(`agendamento_${agendamentoId}_cliente_confirmado`);

      const notifAdminRef = db
        .collection('notificacoes')
        .doc(`agendamento_${agendamentoId}_admin_novo`);

      t.set(notifClienteRef, {
        clienteId: clienteUid,
        userId: clienteUid,

        tipo: 'cliente',
        type: 'agendamento',
        dedupeKey: `agendamento:${agendamentoId}:cliente:confirmado`,

        agendamentoId,
        estabelecimentoId,
        estabelecimentoNome: est?.nome || '',

        clienteNome,
        servicoNome,
        data: dataBr,
        horario: horarioNormalizado,

        formaPagamento: formaPagamento || 'local',

        titulo: 'Agendamento confirmado',
        mensagem: `Seu horário de ${servicoNome} foi confirmado para ${dataBr} às ${horarioNormalizado}.`,

        lida: false,
        apagada: false,

        criadoEm: FieldValue.serverTimestamp(),
      });

      t.set(notifAdminRef, {
        adminId,

        tipo: 'admin',
        type: 'agendamento',
        dedupeKey: `agendamento:${agendamentoId}:admin:novo`,

        agendamentoId,
        estabelecimentoId,
        estabelecimentoNome: est?.nome || '',

        clienteUid,
        clienteNome,
        servicoNome,
        data: dataBr,
        horario: horarioNormalizado,

        formaPagamento: formaPagamento || 'local',

        titulo: 'Novo agendamento',
        mensagem: `${clienteNome} marcou ${servicoNome} para ${dataBr} às ${horarioNormalizado}.`,

        lida: false,
        apagada: false,

        criadoEm: FieldValue.serverTimestamp(),
      });
    });

    return {
      ok: true,
      id: agendamentoId,
      slotsOcupados,
    };
  }
);
