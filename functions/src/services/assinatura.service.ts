import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

import { db } from '../config/firebase';
import { REGION } from '../config/region';
import { dataKey, gerarSlots } from '../utils/helpers';

// ─────────────────────────────
// 🚀 CACHE SIMPLES (reduz reads)
// ─────────────────────────────
const cachePlano = new Map<string, any>();

// ─────────────────────────────
// 🔒 LOCK LEVE (ANTI DUPLICAÇÃO)
// ─────────────────────────────
async function lock(id: string) {
  const ref = db.collection('locks').doc(id);

  try {
    await ref.create({
      t: Date.now(),
      exp: Date.now() + 30000,
    });
  } catch {
    const snap = await ref.get();
    const data = snap.data();

    if (data?.exp > Date.now()) {
      throw new HttpsError('resource-exhausted', 'LOCKED');
    }

    await ref.set({
      t: Date.now(),
      exp: Date.now() + 30000,
    });
  }
}

async function unlock(id: string) {
  await db.collection('locks').doc(id).delete().catch(() => {});
}

// ─────────────────────────────
// ⚡ PLANO CHECK (ULTRA LEVE)
// ─────────────────────────────
function isPlanoAtivo(est: any) {
  const agora = Date.now();
  const exp = est?.expiraEm?.toMillis?.() || 0;

  const assinatura =
    est?.assinaturaAtiva &&
    ['essencial', 'pro', 'elite'].includes(est?.plano);

  const trial = est?.plano === 'trial' && exp > agora;

  return assinatura || trial;
}

// ─────────────────────────────
// 🔓 LIBERAR HORÁRIO
// ─────────────────────────────
function liberarHorario(
  ag: any,
  batch: FirebaseFirestore.WriteBatch
) {

  const key =
    ag.dataKey || dataKey(ag.data);

  const duracao =
    Number(
      ag.servicoDuracaoMin ||
      ag.duracao ||
      30
    );

  const intervalo =
    Number(
      ag.intervaloMin || 30
    );

  const slots = gerarSlots(
    ag.horario,
    duracao,
    intervalo
  );

  batch.delete(
    db.collection('agendamentoLocks')
      .doc(
        `${ag.clienteUid}_${ag.data}_${ag.horario}`
      )
  );

  for (const h of slots) {

    batch.delete(
      db.collection('horariosOcupados')
        .doc(
          `${ag.estabelecimentoId}_${key}_${h}`
        )
    );
  }
}

// ─────────────────────────────
// 🧠 PEGAR ESTABELECIMENTO (CACHE)
// ─────────────────────────────
async function getEst(ref: any) {
  const cached = cachePlano.get(ref.id);
  if (cached) return cached;

  const snap = await ref.get();
  const data = snap.data();

  cachePlano.set(ref.id, data);
  return data;
}

// ─────────────────────────────
// 🧪 TRIAL
// ─────────────────────────────
export const iniciarTrial = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

  const { estabelecimentoId } = req.data || {};
  if (!estabelecimentoId) throw new HttpsError('invalid-argument', 'ID obrigatório');

  await lock(estabelecimentoId);

  try {
    const ref = db.collection('estabelecimentos').doc(estabelecimentoId);

    return await db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      const data = snap.data();

      if (!snap.exists) throw new HttpsError('not-found', 'Não existe');
      if (data.adminId !== req.auth.uid) throw new HttpsError('permission-denied', 'Sem permissão');
      if (data.trialUsado) throw new HttpsError('failed-precondition', 'Já usado');

      const now = Date.now();
      const exp = now + 7 * 24 * 60 * 60 * 1000;

      t.update(ref, {
        plano: 'trial',
        statusPlano: 'trial',
        assinaturaAtiva: false,
        trialUsado: true,
        expiraEm: Timestamp.fromMillis(exp),
        atualizadoEm: FieldValue.serverTimestamp(),
      });

      return { ok: true };
    });

  } finally {
    await unlock(estabelecimentoId);
  }
});
function limiteEstabelecimentosPorPlano(plano: string) {
  switch (plano) {
    case 'trial':
    case 'essencial':
      return 2;

    case 'pro':
      return 5;

    case 'elite':
      return Infinity;

    default:
      return 1;
  }
}

function limiteServicosPorPlano(plano: string) {
  switch (plano) {
    case 'trial':
    case 'essencial':
      return 20;

    case 'pro':
      return 80;

    case 'elite':
      return Infinity;

    default:
      return 5;
  }
}
// ─────────────────────────────
// 🏢 SALVAR ESTABELECIMENTO (REDUZIDO)
// ─────────────────────────────
export const salvarEstabelecimento = onCall(
  { region: REGION },

  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Acesso negado');
    }

    const uid = req.auth.uid;
    const { estabelecimentoId, ...data } = req.data || {};

    const snap = await db
      .collection('estabelecimentos')
      .where('adminId', '==', uid)
      .get();

    let planoBase = 'free';

    if (estabelecimentoId) {
      const atualSnap = await db
        .collection('estabelecimentos')
        .doc(estabelecimentoId)
        .get();

      const atual = atualSnap.data();

      if (!atualSnap.exists) {
        throw new HttpsError('not-found', 'Estabelecimento não encontrado');
      }

      if (atual?.adminId !== uid) {
        throw new HttpsError('permission-denied', 'Sem permissão');
      }

      planoBase = atual?.plano || 'free';
    } else if (!snap.empty) {
      const principal =
        snap.docs.find(d => d.data()?.principal) ||
        snap.docs[0];

      planoBase = principal.data()?.plano || 'free';
    }

    const limiteEstabs =
      limiteEstabelecimentosPorPlano(planoBase);

    if (!estabelecimentoId && snap.size >= limiteEstabs) {
      throw new HttpsError(
        'failed-precondition',
        `Seu plano permite até ${limiteEstabs} estabelecimento(s).`
      );
    }

    const servicos = Array.isArray(data.servicos)
      ? data.servicos
      : [];

    const limiteServicos =
      limiteServicosPorPlano(planoBase);

    if (servicos.length > limiteServicos) {
      throw new HttpsError(
        'failed-precondition',
        `Seu plano permite até ${limiteServicos} serviço(s).`
      );
    }

    const ref = estabelecimentoId
      ? db.collection('estabelecimentos').doc(estabelecimentoId)
      : db.collection('estabelecimentos').doc();

    const clean = {
      ...data,
      adminId: uid,
      atualizadoEm: FieldValue.serverTimestamp(),
    };

    if (!estabelecimentoId) {
      clean.criadoEm = FieldValue.serverTimestamp();
      clean.plano = planoBase;
      clean.assinaturaAtiva = planoBase !== 'free';
    }

    await ref.set(clean, { merge: true });

    return {
      ok: true,
      id: ref.id,
      plano: planoBase,
      limites: {
        estabelecimentos: limiteEstabs,
        servicos: limiteServicos,
      },
    };
  }
);
// ─────────────────────────────
// ✔ CONCLUIR AGENDAMENTO
// ─────────────────────────────
export const concluirAgendamento = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

  const { agendamentoId } = req.data || {};
  if (!agendamentoId) throw new HttpsError('invalid-argument', 'ID obrigatório');

  await lock(agendamentoId);

  try {
    const ref = db.collection('agendamentos').doc(agendamentoId);

    return await db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      const ag = snap.data();

      if (!snap.exists) throw new HttpsError('not-found', 'Não existe');
      if (ag.status === 'concluido') return { ok: true };

      const estRef = db.collection('estabelecimentos').doc(ag.estabelecimentoId);
      const estSnap = await t.get(estRef);

      if (!estSnap.exists) throw new HttpsError('failed-precondition', 'Inválido');

      const est = estSnap.data();
      if (!isPlanoAtivo(est)) throw new HttpsError('failed-precondition', 'Plano inativo');

      t.update(ref, {
        status: 'concluido',
        concluidoEm: FieldValue.serverTimestamp(),
      });

      return { ok: true };
    });

  } finally {
    await unlock(agendamentoId);
  }
});

// ─────────────────────────────
// ❌ CANCELAR AGENDAMENTO
// ─────────────────────────────
export const cancelarAgendamento = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

  const { agendamentoId } = req.data || {};
  if (!agendamentoId) throw new HttpsError('invalid-argument', 'ID obrigatório');

  await lock(agendamentoId);

  try {
    const ref = db.collection('agendamentos').doc(agendamentoId);

    return await db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      const ag = snap.data();

      if (!snap.exists) throw new HttpsError('not-found', 'Não existe');
    if (!['pendente', 'confirmado'].includes(ag.status)) {
  throw new HttpsError(
    'failed-precondition',
    'Estado inválido'
  );
}
      const estRef = db.collection('estabelecimentos').doc(ag.estabelecimentoId);
      const estSnap = await t.get(estRef);

      if (!estSnap.exists) throw new HttpsError('failed-precondition', 'Inválido');

      const est = estSnap.data();
      if (!isPlanoAtivo(est)) throw new HttpsError('failed-precondition', 'Plano inativo');

      t.update(ref, {
        status: 'cancelado',
        canceladoEm: FieldValue.serverTimestamp(),
      });

      const batch = t as any;
      liberarHorario(ag, batch);

      return { ok: true };
    });

  } finally {
    await unlock(agendamentoId);
  }
});
