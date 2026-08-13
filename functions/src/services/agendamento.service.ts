import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { db } from '../config/firebase';
import { REGION } from '../config/region';
import { parseDataHoraBR, planoAtivo, dataKey, gerarSlots } from '../utils/helpers';
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

      const existeConflito = conflitoSnaps.some((s) => {
        if (!s.exists) {
          return false;
        }

        const ocupado = s.data() as any;
        const expiraMs = ocupado?.pagamentoExpiraEm?.toMillis?.() || 0;
        const reservaVencida =
          ocupado?.status === 'aguardando_pagamento' &&
          ocupado?.statusPagamento !== 'approved' &&
          expiraMs > 0 &&
          expiraMs <= Date.now();

        return !reservaVencida;
      });

      if (existeConflito) {
        throw new HttpsError(
          'already-exists',
          'Horário já ocupado'
        );
      }

      const agRef = db.collection('agendamentos').doc();

      agendamentoId = agRef.id;

      const adminId = est?.adminId || '';
const formaPagamentoFinal =
  formaPagamento === 'app' || formaPagamento === 'sinal'
    ? formaPagamento
    : 'local';

const sinalFestivoAtivo =
  est?.sinalFestivoAtivo === true;

if (sinalFestivoAtivo && formaPagamentoFinal === 'local') {
  throw new HttpsError(
    'failed-precondition',
    'Este estabelecimento exige sinal de 50% para reservar.'
  );
}

if (
  formaPagamentoFinal === 'sinal' &&
  (
    !sinalFestivoAtivo ||
    !est?.pixChave ||
    !est?.telefone
  )
) {
  throw new HttpsError(
    'failed-precondition',
    'Sinal de reserva indisponivel. O estabelecimento precisa ter PIX e WhatsApp cadastrados.'
  );
}

if (
  formaPagamentoFinal === 'app' &&
  (
    !['pro', 'elite'].includes(String(est?.plano || '')) ||
    est?.pagamentoAppAtivo !== true ||
    !est?.pixChave ||
    !est?.telefone
  )
) {
  throw new HttpsError(
    'failed-precondition',
    'Pagamento completo pelo app disponivel apenas para Pro ou Elite com PIX e WhatsApp cadastrados.'
  );
}

const pagamentoOnline =
  formaPagamentoFinal === 'app' ||
  formaPagamentoFinal === 'sinal';

const percentualPagamento =
  formaPagamentoFinal === 'sinal'
    ? 50
    : formaPagamentoFinal === 'app'
      ? 100
      : 0;

const valorPagamento =
  formaPagamentoFinal === 'sinal'
    ? Number(servico.preco || 0) * 0.5
    : formaPagamentoFinal === 'app'
      ? Number(servico.preco || 0)
      : 0;

const pagamentoExpiraEm =
  pagamentoOnline
    ? Timestamp.fromDate(new Date(Date.now() + 15 * 60 * 1000))
    : null;

const statusInicial =
  pagamentoOnline
    ? 'aguardando_pagamento'
    : 'confirmado';

const statusPagamentoInicial =
  pagamentoOnline
    ? 'pending'
    : 'nao_aplicavel';

const tituloCliente =
  pagamentoOnline
    ? formaPagamentoFinal === 'sinal'
      ? 'Aguardando sinal de reserva'
      : 'Aguardando pagamento'
    : 'Agendamento confirmado';

const mensagemCliente =
  pagamentoOnline
    ? formaPagamentoFinal === 'sinal'
      ? `Seu horário de ${servicoNome} ficou reservado por 15 minutos aguardando o PIX do sinal de 50%. Ele só será confirmado após o estabelecimento conferir o comprovante.`
      : `Seu horário de ${servicoNome} ficou reservado por 15 minutos aguardando pagamento. O agendamento só será confirmado após o estabelecimento conferir o comprovante.`
    : `Seu horário de ${servicoNome} foi confirmado para ${dataBr} às ${horarioNormalizado}.`;

const tituloAdmin =
  pagamentoOnline
    ? formaPagamentoFinal === 'sinal'
      ? 'Novo agendamento aguardando sinal'
      : 'Novo agendamento aguardando pagamento'
    : 'Novo agendamento';

const mensagemAdmin =
  pagamentoOnline
    ? formaPagamentoFinal === 'sinal'
      ? `${clienteNome} iniciou uma reserva de ${servicoNome} para ${dataBr} às ${horarioNormalizado}. Confirme somente depois do PIX de 50% aprovado.`
      : `${clienteNome} iniciou uma reserva de ${servicoNome} para ${dataBr} às ${horarioNormalizado}. Confirme somente depois do pagamento aprovado.`
    : `${clienteNome} marcou ${servicoNome} para ${dataBr} às ${horarioNormalizado}.`;
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

        status: statusInicial,

statusPagamento: statusPagamentoInicial,

formaPagamento: formaPagamentoFinal,
valorPagamento,
percentualPagamento,
reservaTemporaria: pagamentoOnline,
pagamentoExpiraEm,

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
            status: statusInicial,
            statusPagamento: statusPagamentoInicial,
            pagamentoExpiraEm,

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

        formaPagamento: formaPagamentoFinal,

       titulo: tituloCliente,
mensagem: mensagemCliente,

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

        formaPagamento: formaPagamentoFinal,

      titulo: tituloAdmin,
mensagem: mensagemAdmin,

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

export const apagarAgendamentoCliente = onCall(
  {
    region: REGION,
    maxInstances: 50,
  },

  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Acesso negado');
    }

    const { agendamentoId } = request.data || {};

    if (!agendamentoId) {
      throw new HttpsError('invalid-argument', 'Agendamento obrigatorio');
    }

    const agRef = db.collection('agendamentos').doc(agendamentoId);
    let agendamento: any = null;

    await db.runTransaction(async (t) => {
      const snap = await t.get(agRef);

      if (!snap.exists) {
        throw new HttpsError('not-found', 'Agendamento nao encontrado');
      }

      const ag = snap.data() as any;

      if (ag.clienteUid !== request.auth.uid && ag.clienteId !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'Sem permissao');
      }

      const expiraMs = ag.pagamentoExpiraEm?.toMillis?.() || 0;
      const expirado =
        ag.pagamentoExpirado === true ||
        ag.statusPagamento === 'expired' ||
        (
          ag.status === 'aguardando_pagamento' &&
          ag.statusPagamento !== 'approved' &&
          expiraMs > 0 &&
          expiraMs <= Date.now()
        );

      if (ag.status !== 'cancelado' && !expirado) {
        throw new HttpsError(
          'failed-precondition',
          'Apenas reservas expiradas ou canceladas podem ser apagadas.'
        );
      }

      t.update(agRef, {
        deletadoCliente: true,
        apagadoClienteEm: FieldValue.serverTimestamp(),
        atualizadoEm: FieldValue.serverTimestamp(),
      });
      agendamento = ag;
    });

    const [pagamentosSnap, notificacoesSnap] = await Promise.all([
      db.collection('pagamentos')
        .where('agendamentoId', '==', agendamentoId)
        .limit(20)
        .get(),
      db.collection('notificacoes')
        .where('agendamentoId', '==', agendamentoId)
        .limit(50)
        .get(),
    ]);

    const batch = db.batch();

    pagamentosSnap.docs.forEach(doc => {
      if (doc.data()?.status !== 'approved') {
        batch.delete(doc.ref);
      }
    });

    notificacoesSnap.docs.forEach(doc => {
      const n = doc.data() as any;

      if (
        n.userId === request.auth?.uid ||
        n.clienteId === request.auth?.uid ||
        n.tipo === 'cliente'
      ) {
        batch.delete(doc.ref);
      }
    });

    await batch.commit();

    return {
      ok: true,
      id: agendamentoId,
      estabelecimentoId: agendamento?.estabelecimentoId || '',
    };
  }
);

export const apagarAgendamentoAdmin = onCall(
  {
    region: REGION,
    maxInstances: 50,
  },

  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Acesso negado');
    }

    const { agendamentoId } = request.data || {};

    if (!agendamentoId) {
      throw new HttpsError('invalid-argument', 'Agendamento obrigatorio');
    }

    const agRef = db.collection('agendamentos').doc(agendamentoId);
    let agendamento: any = null;

    await db.runTransaction(async (t) => {
      const snap = await t.get(agRef);

      if (!snap.exists) {
        throw new HttpsError('not-found', 'Agendamento nao encontrado');
      }

      const ag = snap.data() as any;

      if (ag.adminId !== request.auth?.uid) {
        throw new HttpsError('permission-denied', 'Sem permissao');
      }

      const expiraMs = ag.pagamentoExpiraEm?.toMillis?.() || 0;
      const expirado =
        ag.pagamentoExpirado === true ||
        ag.statusPagamento === 'expired' ||
        (
          ag.status === 'aguardando_pagamento' &&
          ag.statusPagamento !== 'approved' &&
          expiraMs > 0 &&
          expiraMs <= Date.now()
        );

      if (ag.status !== 'cancelado' && !expirado) {
        throw new HttpsError(
          'failed-precondition',
          'Apenas reservas expiradas ou canceladas podem ser apagadas.'
        );
      }

      if (ag.statusPagamento === 'approved') {
        throw new HttpsError(
          'failed-precondition',
          'Pagamentos aprovados nao podem ser apagados como expirados.'
        );
      }

      t.update(agRef, {
        deletadoAdmin: true,
        apagadoAdminEm: FieldValue.serverTimestamp(),
        statusPagamento: expirado ? 'expired' : ag.statusPagamento,
        pixStatus: expirado ? 'expired' : ag.pixStatus,
        reservaTemporaria: false,
        pagamentoExpirado: expirado || ag.pagamentoExpirado === true,
        horarioLiberado: true,
        atualizadoEm: FieldValue.serverTimestamp(),
      });

      if (expirado) {
        liberarHorarioReserva({ id: agendamentoId, ...ag }, t);
      }

      agendamento = ag;
    });

    const [pagamentosSnap, notificacoesSnap] = await Promise.all([
      db.collection('pagamentos')
        .where('agendamentoId', '==', agendamentoId)
        .limit(20)
        .get(),
      db.collection('notificacoes')
        .where('agendamentoId', '==', agendamentoId)
        .limit(50)
        .get(),
    ]);

    const batch = db.batch();

    pagamentosSnap.docs.forEach(doc => {
      if (doc.data()?.status !== 'approved') {
        batch.delete(doc.ref);
      }
    });

    notificacoesSnap.docs.forEach(doc => {
      const n = doc.data() as any;

      if (
        n.adminId === request.auth?.uid ||
        n.estabelecimentoId === agendamento?.estabelecimentoId ||
        n.tipo === 'admin'
      ) {
        batch.delete(doc.ref);
      }
    });

    await batch.commit();

    return {
      ok: true,
      id: agendamentoId,
      estabelecimentoId: agendamento?.estabelecimentoId || '',
    };
  }
);
