import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

import { db } from '../config/firebase';
import { REGION } from '../config/region';

// ─────────────────────────────────────────────
// 🔐 LOCK SYSTEM (ATÔMICO + EXPIRAÇÃO)
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
// 🧪 TRIAL (VERSÃO CONSISTENTE)
// ─────────────────────────────────────────────

export const iniciarTrial = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

  const { estabelecimentoId } = req.data || {};
  if (!estabelecimentoId) throw new HttpsError('invalid-argument', 'ID obrigatório');

  const ref = db.collection('estabelecimentos').doc(estabelecimentoId);

  return db.runTransaction(async (t) => {
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
      statusPlano: 'trial', // 🔥 NOVO (consistência UI)
      assinaturaAtiva: true,
      trialUsado: true,
      trialInicio: Timestamp.fromDate(now),
      expiraEm: Timestamp.fromDate(exp),
      atualizadoEm: FieldValue.serverTimestamp(),
    });

    return { ok: true };
  });
});

// ─────────────────────────────────────────────
// 🏢 SALVAR ESTABELECIMENTO (SEGURO)
// ─────────────────────────────────────────────

export const salvarEstabelecimento = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

  const adminId = req.auth.uid;
  const { estabelecimentoId, ...raw } = req.data || {};

  const isNew = !estabelecimentoId;
  const ref = db.collection('estabelecimentos').doc(estabelecimentoId || undefined);

  const snapAll = await db.collection('estabelecimentos')
    .where('adminId', '==', adminId)
    .get();

  const limite = 1;

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
// ✔ CONCLUIR AGENDAMENTO (ROBUSTO)
// ─────────────────────────────────────────────

export const concluirAgendamento = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

  const { agendamentoId } = req.data || {};
  if (!agendamentoId) throw new HttpsError('invalid-argument', 'ID obrigatório');

  const ref = db.collection('agendamentos').doc(agendamentoId);

  await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Não existe');

    const data = snap.data()!;

    if (data.adminId !== req.auth!.uid) {
      throw new HttpsError('permission-denied', 'Sem permissão');
    }

    const estRef = db.collection('estabelecimentos').doc(data.estabelecimentoId);
    const estSnap = await t.get(estRef);

    if (!estSnap.exists || !estSnap.data()?.assinaturaAtiva) {
      throw new HttpsError('failed-precondition', 'Assinatura inativa');
    }

    if (data.status === 'concluido') return; // 🔥 idempotência

    t.update(ref, {
      status: 'concluido',
      concluidoEm: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true };
});

// ─────────────────────────────────────────────
// ❌ CANCELAMENTO (ANTI DUPLICAÇÃO)
// ─────────────────────────────────────────────

export const cancelarAgendamento = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

  const { agendamentoId } = req.data || {};
  if (!agendamentoId) throw new HttpsError('invalid-argument', 'ID obrigatório');

  const ref = db.collection('agendamentos').doc(agendamentoId);

  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Não encontrado');

  const ag = snap.data()!;

  if (ag.status === 'cancelado' || ag.status === 'concluido') {
    throw new HttpsError('failed-precondition', 'Estado inválido');
  }

  if (ag.adminId !== req.auth.uid && ag.clienteUid !== req.auth.uid) {
    throw new HttpsError('permission-denied', 'Sem permissão');
  }

  await db.runTransaction(async (t) => {
    t.update(ref, {
      status: 'cancelado',
      canceladoEm: FieldValue.serverTimestamp(),
      canceladoPor: req.auth.uid,
    });

    t.delete(db.collection('agendamentoLocks').doc(`${ag.clienteUid}_${ag.data}_${ag.horario}`));
    t.delete(db.collection('horariosOcupados').doc(`${ag.estabelecimentoId}_${ag.data}_${ag.horario}`));
  });

  return { ok: true };
});