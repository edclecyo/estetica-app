import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import {
  Timestamp,
  FieldValue,
  WriteBatch,
} from 'firebase-admin/firestore';

import {
  planoAtivo,
  dataKey,
  gerarSlots,
} from '../utils/helpers';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

// ─────────────────────────────────────────────
// 🔓 LIBERAR HORÁRIO
// ─────────────────────────────────────────────

const liberarHorario = (ag: any, batch: WriteBatch) => {
  const key = dataKey(ag.data);

  const estId = ag.estabelecimentoId;
  const duracao = ag.servicoDuracaoMin || 30;

  const slots = gerarSlots(ag.horario, duracao);

  for (const hora of slots) {
    batch.delete(
      db.collection('horariosOcupados')
        .doc(`${estId}_${key}_${hora}`)
    );
  }

  batch.delete(
    db.collection('agendamentoLocks')
      .doc(`${ag.clienteUid}_${ag.data}_${ag.horario}`)
  );
};

async function checkPlanoAtivo(t: any, estabelecimentoId: string) {
  const ref = db.collection('estabelecimentos').doc(estabelecimentoId);
  const snap = await t.get(ref);

  if (!snap.exists) {
    throw new HttpsError('not-found', 'Estabelecimento não encontrado');
  }

  const est = snap.data();

  const agora = Date.now();
  const expira = est?.expiraEm?.toDate?.()?.getTime?.() ?? 0;

  const assinaturaAtiva = est?.assinaturaAtiva === true;

  const trialAtivo =
    est?.plano === 'trial' && expira > agora;

  const trialExpirado =
    est?.plano === 'trial' && expira <= agora;

  // 🔴 Se trial expirou → atualiza status
  if (trialExpirado) {
    t.update(ref, {
      statusPlano: 'expirado',
      assinaturaAtiva: false,
    });
  }

  // 🔒 BLOQUEIO REAL
  if (!assinaturaAtiva && !trialAtivo) {
    throw new HttpsError(
      'failed-precondition',
      trialExpirado
        ? 'Trial expirado. Ative um plano.'
        : 'Ative o trial ou um plano para continuar.'
    );
  }

  return est;
}
// ─────────────────────────────────────────────
// 🔐 LOCK SYSTEM (CORRIGIDO - ATÔMICO)
// ─────────────────────────────────────────────

export async function acquireLock(id: string, ttlSec = 30) {
  const ref = db.collection('locks').doc(id);

  const expiresAt = Date.now() + ttlSec * 1000;

  try {
    await ref.create({
      status: 'locked',
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(expiresAt),
    });

    return true;
  } catch (e: any) {
    const snap = await ref.get();

    const data = snap.data();
    const current = data?.expiresAt?.toMillis?.() || 0;

    if (current > Date.now()) {
      throw new HttpsError('resource-exhausted', 'LOCKED');
    }

    await ref.set({
      status: 'locked',
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(expiresAt),
    });

    return true;
  }
}

export async function releaseLock(id: string) {
  await db.collection('locks').doc(id).delete().catch(() => null);
}

// ─────────────────────────────────────────────
// 🔒 NORMALIZAR PLANO (CORRIGIDO)
// ─────────────────────────────────────────────

function normalizarPlano(est: any, t: any, ref: any): boolean {
  const agora = Date.now();

  const expira = est?.expiraEm?.toDate?.()?.getTime?.() ?? Infinity;

  const assinaturaAtiva = est?.assinaturaAtiva === true;

  const trialAtivo =
    est?.plano === 'trial' && expira > agora;

  // ❌ expirou trial
  if (est?.plano === 'trial' && expira <= agora) {
    t.update(ref, {
      statusPlano: 'expirado',
      assinaturaAtiva: false,
    });
    return false;
  }

  if (trialAtivo && est?.statusPlano !== 'trial') {
    t.update(ref, { statusPlano: 'trial' });
  }

  if (assinaturaAtiva && est?.statusPlano !== 'ativo') {
    t.update(ref, { statusPlano: 'ativo' });
  }

  return trialAtivo || assinaturaAtiva;
}

// ─────────────────────────────────────────────
// 🧪 TRIAL
// ─────────────────────────────────────────────

export const iniciarTrial = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

  const { estabelecimentoId } = req.data || {};
  if (!estabelecimentoId) throw new HttpsError('invalid-argument', 'ID obrigatório');

  const ref = db.collection('estabelecimentos').doc(estabelecimentoId);

  await acquireLock(estabelecimentoId);

  try {
    return await db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'Não encontrado');

      const data = snap.data()!;

      if (data.adminId !== req.auth!.uid) {
        throw new HttpsError('permission-denied', 'Sem permissão');
      }

      if (data.trialUsado) {
        throw new HttpsError('failed-precondition', 'Trial já usado');
      }

      const now = new Date();
      const exp = new Date();
      exp.setDate(now.getDate() + 7);

      t.update(ref, {
        plano: 'trial',
        statusPlano: 'trial',
        assinaturaAtiva: false,
        trialUsado: true,
        trialInicio: Timestamp.fromDate(now),
        expiraEm: Timestamp.fromDate(exp),
        atualizadoEm: FieldValue.serverTimestamp(),
      });

      return { ok: true };
    });
  } finally {
    await releaseLock(estabelecimentoId);
  }
});

// ─────────────────────────────────────────────
// 🏢 SALVAR ESTABELECIMENTO
// ─────────────────────────────────────────────

export const salvarEstabelecimento = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

  const adminId = req.auth.uid;
  const { estabelecimentoId, ...raw } = req.data || {};

  const isNew = !estabelecimentoId;

  const ref = estabelecimentoId
    ? db.collection('estabelecimentos').doc(estabelecimentoId)
    : db.collection('estabelecimentos').doc();

  const snapAll = await db.collection('estabelecimentos')
    .where('adminId', '==', adminId)
    .get();

  const plano =
    snapAll.docs.find(d => d.data().principal)?.data()?.plano ||
    snapAll.docs[0]?.data()?.plano ||
    'free';

  const limites: Record<string, number> = {
    free: 1,
    trial: 1,
    essencial: 2,
    pro: 5,
    elite: Infinity,
  };

  const ativos = snapAll.docs.filter(d =>
    ['ativo', 'trial'].includes(d.data()?.statusPlano)
  ).length;

  if (isNew && ativos >= (limites[plano] ?? 1)) {
    throw new HttpsError('failed-precondition', 'Limite atingido');
  }

  if (!isNew) {
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Não existe');

    if (snap.data()?.adminId !== adminId) {
      throw new HttpsError('permission-denied', 'Sem permissão');
    }
  }

  const forbidden = ['plano', 'assinaturaAtiva', 'expiraEm', 'adminId', 'statusPlano'];
  forbidden.forEach(k => delete (raw as any)[k]);

  const payload = {
    ...raw,
    adminId,
    atualizadoEm: FieldValue.serverTimestamp(),

    ...(isNew && {
      criadoEm: FieldValue.serverTimestamp(),
      plano: 'free',
      statusPlano: 'free',
      assinaturaAtiva: false,
      trialUsado: false,
    }),
  };

  await ref.set(payload, { merge: true });

  return { ok: true, id: ref.id };
});

// ─────────────────────────────────────────────
// ✔ CONCLUIR AGENDAMENTO
// ─────────────────────────────────────────────

export const concluirAgendamento = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

  const { agendamentoId } = req.data || {};
  if (!agendamentoId) throw new HttpsError('invalid-argument', 'ID obrigatório');

  const ref = db.collection('agendamentos').doc(agendamentoId);

  await acquireLock(agendamentoId);

  try {
    const result = await db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'Não existe');

      const data = snap.data()!;

      const estRef = db.collection('estabelecimentos').doc(data.estabelecimentoId);
      const estSnap = await t.get(estRef);

      if (!estSnap.exists) {
        throw new HttpsError('failed-precondition', 'Estabelecimento inválido');
      }

      const est = await checkPlanoAtivo(t, data.estabelecimentoId);

      const valido = normalizarPlano(est, t, estRef);
      if (!valido) {
        throw new HttpsError('failed-precondition', 'Plano inativo');
      }

      if (data.status === 'concluido') return { ok: true };

      // ✔ atualiza status
      t.update(ref, {
        status: 'concluido',
        concluidoEm: FieldValue.serverTimestamp(),
      });

      // 🔔 NOTIFICA CLIENTE
t.set(db.collection('notificacoes').doc(), {
  userId: data.clienteUid,
  fromUid: data.adminId,
  tipo: 'agendamento_concluido',
  titulo: 'Atendimento concluído',
  mensagem: 'Seu agendamento foi finalizado com sucesso.',
  lida: false,
  criadoEm: FieldValue.serverTimestamp(),
});

     // 🔔 NOTIFICA ADMIN
t.set(db.collection('notificacoes').doc(), {
  userId: data.adminId,
  fromUid: data.clienteUid,
  tipo: 'agendamento_concluido',
  titulo: 'Agendamento concluído',
  mensagem: 'Você concluiu um atendimento.',
  lida: false,
  criadoEm: FieldValue.serverTimestamp(),
});

      return { ok: true };
    });

    return result;

  } finally {
    await releaseLock(agendamentoId);
  }
});

// ─────────────────────────────────────────────
// ❌ CANCELAR AGENDAMENTO
// ─────────────────────────────────────────────

export const cancelarAgendamento = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

  const { agendamentoId } = req.data || {};
  if (!agendamentoId) throw new HttpsError('invalid-argument', 'ID obrigatório');

  const ref = db.collection('agendamentos').doc(agendamentoId);

  await acquireLock(agendamentoId);

  try {
    const result = await db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'Não encontrado');

      const ag = snap.data()!;

      const estRef = db.collection('estabelecimentos').doc(ag.estabelecimentoId);
      const estSnap = await t.get(estRef);

      if (!estSnap.exists) {
        throw new HttpsError('failed-precondition', 'Estabelecimento inválido');
      }

     const est = await checkPlanoAtivo(t, ag.estabelecimentoId);

      const valido = normalizarPlano(est, t, estRef);
      if (!valido) {
        throw new HttpsError('failed-precondition', 'Plano inativo');
      }

      if (ag.status === 'cancelado' || ag.status === 'concluido') {
        throw new HttpsError('failed-precondition', 'Estado inválido');
      }

      if (ag.adminId !== req.auth.uid && ag.clienteUid !== req.auth.uid) {
        throw new HttpsError('permission-denied', 'Sem permissão');
      }

      // ✔ atualiza status
      t.update(ref, {
        status: 'cancelado',
        canceladoEm: FieldValue.serverTimestamp(),
        canceladoPor: req.auth.uid,
      });

      const key = dataKey(ag.data);

      t.delete(db.collection('agendamentoLocks')
        .doc(`${ag.clienteUid}_${ag.data}_${ag.horario}`));

      t.delete(db.collection('horariosOcupados')
        .doc(`${ag.estabelecimentoId}_${key}_${ag.horario}`));

      // 🔔 NOTIFICA CLIENTE
      t.set(db.collection('notificacoes').doc(), {
        userId: ag.clienteUid,
        fromUid: ag.adminId,
        tipo: 'agendamento_cancelado',
        titulo: 'Agendamento cancelado',
        mensagem: 'Seu agendamento foi cancelado.',
        lida: false,
        criadoEm: FieldValue.serverTimestamp(),
      });

      // 🔔 NOTIFICA ADMIN
      t.set(db.collection('notificacoes').doc(), {
        userId: ag.adminId,
        fromUid: ag.clienteUid,
        tipo: 'agendamento_cancelado',
        titulo: 'Cancelamento realizado',
        mensagem: 'Você cancelou um agendamento.',
        lida: false,
        criadoEm: FieldValue.serverTimestamp(),
      });

      return { ok: true };
    });

    return result;

  } finally {
    await releaseLock(agendamentoId);
  }
});