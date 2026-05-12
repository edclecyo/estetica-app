import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';

import { db } from '../config/firebase';
import { REGION } from '../config/region';
import { parseDataHoraBR, planoAtivo, dataKey } from '../utils/helpers';
import { RATE_LIMIT_MS } from '../config/rateLimit';

// ─────────────────────────────
// UTILS
// ─────────────────────────────
const toMinutes = (h: string) => {
  const [hh, mm] = h.split(':').map(Number);

  return hh * 60 + mm;
};

const toHHMM = (min: number) => {

  const h = Math.floor(min / 60);

  const m = min % 60;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// ─────────────────────────────
// CRIAR AGENDAMENTO
// ─────────────────────────────
export const criarAgendamento = onCall(
  {
    region: REGION,
    maxInstances: 50,
  },

  async (request) => {

    // 🔒 AUTH
    if (!request.auth) {

      throw new HttpsError(
        'unauthenticated',
        'Acesso negado'
      );
    }

    const clienteUid = request.auth.uid;

    // ─────────────────────────────
    // 🔥 DADOS
    // ─────────────────────────────
    const {
      estabelecimentoId,
      servicoNome,
      clienteNome,
      data: dataBr,
      horario,
      formaPagamento,
    } = request.data || {};

    // ─────────────────────────────
    // 🔥 VALIDAÇÃO
    // ─────────────────────────────
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

    const estRef =
      db.collection('estabelecimentos')
        .doc(estabelecimentoId);

    const rateRef =
      db.collection('rateLimit')
        .doc(clienteUid);

    const key = dataKey(dataBr);

    let agendamentoId = '';
    let adminId = '';

    let slotsOcupados: string[] = [];

    // ─────────────────────────────
    // 🔥 TRANSACTION
    // ─────────────────────────────
    await db.runTransaction(async (t) => {

      const [rateSnap, estSnap] = await Promise.all([
        t.get(rateRef),
        t.get(estRef),
      ]);

      // ─────────────────────────────
      // 🔥 ESTABELECIMENTO
      // ─────────────────────────────
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

      // ─────────────────────────────
      // 🔥 PLANO
      // ─────────────────────────────
      if (!planoAtivo(est)) {

        throw new HttpsError(
          'failed-precondition',
          'Plano inativo'
        );
      }

      // ─────────────────────────────
      // 🔥 RATE LIMIT
      // ─────────────────────────────
      const now = Date.now();

      if (rateSnap.exists) {

        const last =
          rateSnap.data()?.timestamp || 0;

        if (now - last < RATE_LIMIT_MS) {

          throw new HttpsError(
            'resource-exhausted',
            'Aguarde antes de agendar novamente.'
          );
        }
      }

      // ─────────────────────────────
      // 🔥 SERVIÇO
      // ─────────────────────────────
      const servicos =
        Array.isArray(est.servicos)
          ? est.servicos
          : [];

      const servico = servicos.find((s: any) =>

        String(s?.nome || '').trim() ===
        String(servicoNome).trim()
      );

      if (!servico) {

        throw new HttpsError(
          'invalid-argument',
          'Serviço inválido'
        );
      }

      const duracao =
        Number(servico.duracao || 0);

      if (!duracao) {

        throw new HttpsError(
          'invalid-argument',
          'Serviço sem duração'
        );
      }

      // ─────────────────────────────
      // 🔥 VALIDA DATA/HORA
      // ─────────────────────────────
      parseDataHoraBR(
        dataBr,
        horario
      );

      // ─────────────────────────────
      // 🔥 GERA SLOTS
      // ─────────────────────────────
      const inicioMin =
        toMinutes(horario);

      const fimMin =
        inicioMin + duracao;

      const step =
        Number(est?.intervaloMin || 30);

      slotsOcupados = [];

      for (
        let m = inicioMin;
        m < fimMin;
        m += step
      ) {

        slotsOcupados.push(
          toHHMM(m)
        );
      }

      // ─────────────────────────────
      // 🔥 VERIFICA CONFLITO
      // ─────────────────────────────
      const conflitoSnaps = await Promise.all(

        slotsOcupados.map((slot) =>

          t.get(
            db.collection('horariosOcupados')
              .doc(
                `${estabelecimentoId}_${key}_${slot}`
              )
          )
        )
      );

      const existeConflito =
        conflitoSnaps.some(s => s.exists);

      if (existeConflito) {

        throw new HttpsError(
          'already-exists',
          'Horário já ocupado'
        );
      }

      // ─────────────────────────────
      // 🔥 CRIA AGENDAMENTO
      // ─────────────────────────────
      const agRef =
        db.collection('agendamentos').doc();

      agendamentoId = agRef.id;

      adminId =
        est?.adminId || '';

      // ─────────────────────────────
      // 🔥 RATE LIMIT SAVE
      // ─────────────────────────────
      t.set(
        rateRef,
        {
          timestamp: now,
        },
        {
          merge: true,
        }
      );

      // ─────────────────────────────
      // 🔥 AGENDAMENTO
      // ─────────────────────────────
      t.set(agRef, {

        estabelecimentoId,

        estabelecimentoNome:
          est?.nome || 'Estabelecimento',

        adminId,

        servicoNome,

        servicoPreco:
          Number(servico.preco || 0),

        duracao,

        intervaloMin:
          Number(est?.intervaloMin || 30),

        clienteNome,

        clienteUid,

        data: dataBr,

        dataKey: key,

        horario,

        status: 'confirmado',

        formaPagamento:
          formaPagamento || 'local',

        criadoEm:
          FieldValue.serverTimestamp(),

        atualizadoEm:
          FieldValue.serverTimestamp(),
      });

      // ─────────────────────────────
      // 🔥 BLOQUEIA HORÁRIOS
      // ─────────────────────────────
      for (const slot of slotsOcupados) {

        t.set(

          db.collection('horariosOcupados')
            .doc(
              `${estabelecimentoId}_${key}_${slot}`
            ),

          {
            estabelecimentoId,

            estabelecimentoNome:
              est?.nome || '',

            adminId,

            agendamentoId,

            clienteUid,

            clienteNome,

            servicoNome,

            data: dataBr,

            dataKey: key,

            horario: slot,

            criadoEm:
              FieldValue.serverTimestamp(),
          }
        );
      }

      // ─────────────────────────────
      // 🔔 NOTIFICAÇÃO CLIENTE
      // ─────────────────────────────
      t.set(
        db.collection('notificacoes').doc(),
        {

          clienteId:
            clienteUid,

          tipo:
            'cliente',

          type:
            'agendamento',

          agendamentoId,

          estabelecimentoId,

          estabelecimentoNome:
            est?.nome || '',

          clienteNome,

          servicoNome,

          formaPagamento:
            formaPagamento || 'local',

          titulo:
            'Agendamento confirmado',

          mensagem:
            `Seu horário de ${servicoNome} foi confirmado para ${dataBr} às ${horario}.`,

          lida: false,

          criadoEm:
            FieldValue.serverTimestamp(),
        }
      );

      // ─────────────────────────────
      // 🔔 NOTIFICAÇÃO ADMIN
      // ─────────────────────────────
      t.set(
        db.collection('notificacoes').doc(),
        {

          adminId,

          tipo:
            'admin',

          type:
            'agendamento',

          agendamentoId,

          estabelecimentoId,

          estabelecimentoNome:
            est?.nome || '',

          clienteUid,

          clienteNome,

          servicoNome,

          formaPagamento:
            formaPagamento || 'local',

          titulo:
            'Novo agendamento',

          mensagem:
            `${clienteNome} marcou ${servicoNome} para ${dataBr} às ${horario}.`,

          lida: false,

          criadoEm:
            FieldValue.serverTimestamp(),
        }
      );
    });

    return {
      id: agendamentoId,
      slotsOcupados,
    };
  }
);