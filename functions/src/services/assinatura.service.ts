import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { planoAtivo } from '../utils/helpers';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

// ─────────────────────────────────────────────
// 🔐 LOCK SYSTEM
// ─────────────────────────────────────────────

export async function acquireLock(id: string, ttlSec = 30) {
  const ref = db.collection('locks').doc(id);

  const now = Date.now();
  const expiresAt = now + ttlSec * 1000;

  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);

    if (snap.exists) {
      const data = snap.data()!;
      const current = data.expiresAt?.toMillis?.() || 0;

      if (current > now) {
        throw new HttpsError('resource-exhausted', 'LOCKED');
      }
    }

    t.set(ref, {
      status: 'locked',
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(expiresAt),
    });

    return true;
  });
}

export async function releaseLock(id: string) {
  await db.collection('locks').doc(id).delete().catch(() => null);
}
// ─────────────────────────────────────────────
// 🔒 NORMALIZAR PLANO (AUTO EXPIRA)
// ─────────────────────────────────────────────

function normalizarPlano(est: any, t: any, ref: any): boolean {
  const agora = new Date();
  const expira = est?.expiraEm?.toDate?.() || null;

  const trialAtivo =
  est?.plano === 'trial' &&
  expira !== null &&
  expira.getTime() > agora.getTime();

  const assinaturaAtiva = est?.assinaturaAtiva === true;
// 🔥 garante consistência visual
// ❌ expirou trial (PRIMEIRO)
if (est?.plano === 'trial' && expira && expira.getTime() <= agora.getTime()) {
  t.update(ref, {
    statusPlano: 'expirado',
    assinaturaAtiva: false,
  });
  return false;
}

// depois consistência
if (trialAtivo && est.statusPlano !== 'trial') {
  t.update(ref, { statusPlano: 'trial' });
}

if (assinaturaAtiva && est.statusPlano !== 'ativo') {
  t.update(ref, { statusPlano: 'ativo' });
}

  // ✅ regra FINAL
  if (trialAtivo) return true;
  if (assinaturaAtiva) return true;

  return false;
}

// ─────────────────────────────────────────────
// 🧪 TRIAL (COM LOCK)
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

  const limite = limites[plano] ?? 1;

  if (isNew && snapAll.size >= limite) {
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
// ✔ CONCLUIR AGENDAMENTO (COM LOCK)
// ─────────────────────────────────────────────

export const concluirAgendamento = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

  const { agendamentoId } = req.data || {};
  if (!agendamentoId) throw new HttpsError('invalid-argument', 'ID obrigatório');

  const ref = db.collection('agendamentos').doc(agendamentoId);

  await acquireLock(agendamentoId);

  try {
    await db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'Não existe');

      const data = snap.data()!;

      if (data.adminId !== req.auth!.uid) {
        throw new HttpsError('permission-denied', 'Sem permissão');
      }

      const estRef = db.collection('estabelecimentos').doc(data.estabelecimentoId);
      const estSnap = await t.get(estRef);

if (!estSnap.exists) {
  throw new HttpsError('failed-precondition', 'Estabelecimento inválido');
}
      const est = estSnap.data();

      const valido = normalizarPlano(est, t, estRef);

if (!valido) {
  throw new HttpsError('failed-precondition', 'Plano inativo');
}

      if (data.status === 'concluido') return;

      t.update(ref, {
        status: 'concluido',
        concluidoEm: FieldValue.serverTimestamp(),
      });
    });

    return { ok: true };

  } finally {
    await releaseLock(agendamentoId);
  }
});


// ─────────────────────────────────────────────
// ❌ CANCELAR AGENDAMENTO (COM LOCK + TRANSACTION)
// ─────────────────────────────────────────────

export const cancelarAgendamento = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

  const { agendamentoId } = req.data || {};
  if (!agendamentoId) throw new HttpsError('invalid-argument', 'ID obrigatório');

  const ref = db.collection('agendamentos').doc(agendamentoId);

  await acquireLock(agendamentoId);

  try {
    await db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'Não encontrado');

      const ag = snap.data()!;

      const estRef = db.collection('estabelecimentos').doc(ag.estabelecimentoId);
      const estSnap = await t.get(estRef);

if (!estSnap.exists) {
  throw new HttpsError('failed-precondition', 'Estabelecimento inválido');
}
      const est = estSnap.data();

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

      t.update(ref, {
        status: 'cancelado',
        canceladoEm: FieldValue.serverTimestamp(),
        canceladoPor: req.auth.uid,
      });

      t.delete(db.collection('agendamentoLocks').doc(`${ag.clienteUid}_${ag.data}_${ag.horario}`));
      t.delete(db.collection('horariosOcupados').doc(`${ag.estabelecimentoId}_${ag.data}_${ag.horario}`));
    });

    return { ok: true };

  } finally {
    await releaseLock(agendamentoId);
  }
});