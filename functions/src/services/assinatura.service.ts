import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore'; // Importação limpa

import { db } from '../config/firebase';
import { REGION } from '../config/region';

// ─── 7. INICIAR TRIAL ─────────────────────────────────────────────────────────
export const iniciarTrial = onCall(
  { region: REGION },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Acesso negado');
    }

    const { estabelecimentoId } = req.data;

    if (!estabelecimentoId) {
      throw new HttpsError('invalid-argument', 'estabelecimentoId é obrigatório');
    }

    const estRef = db.collection('estabelecimentos').doc(estabelecimentoId);
    const estSnap = await estRef.get();

    if (!estSnap.exists) {
      throw new HttpsError('not-found', 'Estabelecimento não encontrado');
    }

    const data = estSnap.data();

    if (data?.trialUsado) {
      throw new HttpsError('failed-precondition', 'Trial já utilizado');
    }

    if (data?.adminId !== req.auth.uid) {
      throw new HttpsError('permission-denied', 'Você não pode iniciar trial deste estabelecimento');
    }

    // 🔥 DATA CORRETA
    const agora = new Date();

    const expira = new Date();
    expira.setDate(agora.getDate() + 7);

    await estRef.update({
      plano: 'trial',
      assinaturaAtiva: true,
      trialUsado: true,

      // ✅ PADRÃO FIREBASE (ESSENCIAL)
      trialInicio: Timestamp.fromDate(agora),
expiraEm: Timestamp.fromDate(expira),
    });

    return { ok: true };
  }
);
// ─── 3. SALVAR/EDITAR ESTABELECIMENTO ─────────────────────────────────────────
export const salvarEstabelecimento = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Acesso negado');
  }

  const adminId = request.auth.uid;
  const data = request.data || {};
  const { estabelecimentoId } = data;
  const isNovo = !estabelecimentoId;

  const docRef = isNovo
    ? db.collection('estabelecimentos').doc()
    : db.collection('estabelecimentos').doc(estabelecimentoId);

  const docSnap = await docRef.get();

  // 🔒 SEGURANÇA
  if (!isNovo && docSnap.exists && docSnap.data()?.adminId !== adminId) {
    throw new HttpsError('permission-denied', 'Sem permissão');
  }

  // 🔎 CONTAGEM
  const estabsSnap = await db
  .collection('estabelecimentos')
  .where('adminId', '==', adminId)
  .get();

const totalEstabs = estabsSnap.size;

// 🔥 PLANO ATUAL
let planoAtual = 'free';

if (estabsSnap.docs.length > 0) {
  planoAtual = estabsSnap.docs[0].data().plano || 'free';
}

// 🔥 FUNÇÃO LIMITE
function getLimitePorPlano(plano: string): number {
  switch (plano) {
    case 'trial':
      return 1;
    case 'free':
      return 1;
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

const limite = getLimitePorPlano(planoAtual);

// 🚫 BLOQUEIO
if (isNovo && totalEstabs >= limite) {
  throw new HttpsError(
    'failed-precondition',
    `Seu plano (${planoAtual}) permite até ${limite} estabelecimento(s).`
  );
}

  // 🧼 LIMPEZA
  const cleanData = { ...data };
  const camposProtegidos = [
    'plano',
    'assinaturaAtiva',
    'expiraEm',
    'verificado',
    'adminId',
    'principal',
    'estabelecimentoId'
  ];
  camposProtegidos.forEach(key => delete cleanData[key]);

  // 🏗️ PAYLOAD
  const payload: any = {
    ...cleanData,
    adminId,
    atualizadoEm: FieldValue.serverTimestamp(),
  };

  if (isNovo) {
    payload.criadoEm = admin.firestore.FieldValue.serverTimestamp();
    payload.principal = totalEstabs === 0;
    payload.plano = 'free';
    payload.assinaturaAtiva = false;
    payload.expiraEm = null;
  }

  await docRef.set(payload, { merge: true });

  return { ok: true, id: docRef.id };
});
// ─── 5. CONCLUIR AGENDAMENTO ──────────────────────────────────────────────────
export const concluirAgendamento = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

  const { agendamentoId } = request.data;
  if (!agendamentoId) throw new HttpsError('invalid-argument', 'O ID do agendamento é obrigatório');

  try {
    const agendRef = db.collection('agendamentos').doc(agendamentoId);
    const snap = await agendRef.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Agendamento não encontrado');

    const agendData = snap.data();
    if (agendData?.adminId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Você não tem permissão para alterar este agendamento');
    }

    const estSnap = await db.collection('estabelecimentos').doc(agendData.estabelecimentoId).get();
    if (!estSnap.data()?.assinaturaAtiva) {
      throw new HttpsError('failed-precondition', 'Sua assinatura expirou. Regularize o pagamento para gerir seus agendamentos.');
    }

    await agendRef.update({
      status: 'concluido',
      concluidoEm: admin.firestore.FieldValue.serverTimestamp()
    });

    return { ok: true, message: 'Agendamento concluído com sucesso' };

  } catch (error: any) {
    console.error("Erro ao concluir agendamento:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Erro interno ao processar a conclusão');
  }
});
// ─── CANCELAR AGENDAMENTO ─────────────────────────────────────────────────────
export const cancelarAgendamento = onCall(
  { region: REGION },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

    const { agendamentoId } = req.data;
    if (!agendamentoId) throw new HttpsError('invalid-argument', 'Dados inválidos');

    const agendRef = db.collection('agendamentos').doc(agendamentoId);
    const snap = await agendRef.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Agendamento não encontrado');

    const agend = snap.data()!;
    const isAdmin = agend.adminId === req.auth.uid;
    const isCliente = agend.clienteUid === req.auth.uid;
    if (!isAdmin && !isCliente) throw new HttpsError('permission-denied', 'Sem permissão');
    if (agend.status === 'concluido') throw new HttpsError('failed-precondition', 'Não pode cancelar concluído');
    if (agend.status === 'cancelado') return { ok: true };

    await agendRef.update({
      status: 'cancelado',
      canceladoEm: admin.firestore.FieldValue.serverTimestamp(),
      canceladoPor: req.auth.uid,
    });

    return { ok: true };
  }
);