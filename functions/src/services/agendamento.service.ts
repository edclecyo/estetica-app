
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
// Importações consistentes com seus outros arquivos
import { Timestamp, FieldValue } from 'firebase-admin/firestore'; 

import { db } from '../config/firebase';
import { REGION } from '../config/region';

import { parseDataHoraBR } from '../utils/helpers';
import { getTokenUsuario as getTokenCliente } from './notificacao.service';
import { RATE_LIMIT_MS } from '../config/rateLimit';

// ─── 4. CRIAR AGENDAMENTO ─────────────────────────────────────────────────────
export const criarAgendamento = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Acesso negado');
    }

    const body = request.data || {};
    const clienteUid = request.auth.uid;

    const estabelecimentoId = String(body.estabelecimentoId || "");
    const servicoNome = String(body.servicoNome || "").trim();
    const clienteNome = String(body.clienteNome || "").trim();
    const dataBr = String(body.data || "").trim();
    const horario = String(body.horario || "").trim();

   const partes = dataBr.split("/");
if (partes.length !== 3) {
  throw new HttpsError('invalid-argument', 'Data inválida');
}

const [dia, mes, ano] = partes;

const mesRef = `${ano}_${String(mes).padStart(2, "0")}`;

    if (clienteNome.length > 100) throw new HttpsError('invalid-argument', 'Nome muito grande');
    if (servicoNome.length > 100) throw new HttpsError('invalid-argument', 'Serviço inválido');
    if (!estabelecimentoId || !servicoNome || !clienteNome || !dataBr || !horario) {
      throw new HttpsError('invalid-argument', 'Campos obrigatórios ausentes');
    }

    const estSnap = await db.collection('estabelecimentos').doc(estabelecimentoId).get();
    if (!estSnap.exists) throw new HttpsError('not-found', 'Estabelecimento não encontrado');

    const est = estSnap.data() || {};
    const agora = new Date();
const expiraEm = est.expiraEm?.toDate?.() || null;

const podeUsar =
  est.assinaturaAtiva === true ||
  (est.plano === 'free' && !est.trialUsado);

if (!podeUsar || (expiraEm && agora > expiraEm)) {
  throw new HttpsError(
    'failed-precondition',
    'Ative o período de teste para começar a usar o sistema.'
  );
}

    const servicos = Array.isArray(est.servicos) ? est.servicos : [];
    const servico = servicos.find((s: any) => String(s?.nome || "").trim() === servicoNome);
    if (!servico) throw new HttpsError('invalid-argument', 'Serviço inválido para este estabelecimento');

    const dataHora = parseDataHoraBR(dataBr, horario);
    const notificarEmDate = new Date(dataHora.getTime() - (60 * 60 * 1000));
    const notificarEm = Timestamp.fromDate(notificarEmDate);

    const fcmTokenCliente = await getTokenCliente(clienteUid);

    const uniqueId = `${clienteUid}_${dataBr}_${horario}`;
    const lockRef = db.collection('agendamentoLocks').doc(uniqueId);

    const conflitoId = `${estabelecimentoId}_${dataBr}_${horario}`;
    const conflitoRef = db.collection('horariosOcupados').doc(conflitoId);

    // Rate limit com transaction
    const rateRef = db.collection('rateLimit').doc(clienteUid);
    await db.runTransaction(async (t) => {
      const snap = await t.get(rateRef);
      const now = Date.now();
      if (snap.exists) {
       const ts = snap.data()?.timestamp;
// Se for objeto Timestamp do Firebase usa toMillis(), se for Number usa direto
const last = typeof ts === 'number' ? ts : (ts?.toMillis ? ts.toMillis() : 0);

const diff = now - last;
        if (diff < RATE_LIMIT_MS) throw new HttpsError('resource-exhausted', 'Muitas requisições');
      }
      t.set(rateRef, { timestamp: now });
    });

    const expira = new Date();
    expira.setDate(expira.getDate() + 2);

    let agendId = '';

    await db.runTransaction(async (t) => {
      const lockSnap = await t.get(lockRef);
      if (lockSnap.exists) {
        const expiraEm = lockSnap.data()?.expiraEm?.toDate?.();
        if (expiraEm && expiraEm > new Date()) {
          throw new HttpsError('already-exists', 'Você já tem um agendamento nesse horário');
        }
      }

      const conflitoSnap = await t.get(conflitoRef);
      if (conflitoSnap.exists) {
        const expiraEm = conflitoSnap.data()?.expiraEm?.toDate?.();
        if (expiraEm && expiraEm > new Date()) {
          throw new HttpsError('already-exists', 'Horário já ocupado');
        }
      }

      t.set(lockRef, {
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        expiraEm: admin.firestore.Timestamp.fromDate(expira)
      });

      t.set(conflitoRef, {
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        expiraEm: admin.firestore.Timestamp.fromDate(expira)
      });

      const agendRef = db.collection('agendamentos').doc();
      agendId = agendRef.id;

      t.set(agendRef, {
        estabelecimentoId,
        estabelecimentoNome: est.nome || "Estabelecimento",
        adminId: est.adminId || null,
        servicoId: servico.id || null,
        servicoNome: servico.nome,
        servicoPreco: Number(servico.preco || 0),
        clienteNome,
        clienteUid,
        data: dataBr,
        horario,
        mesRef,
        status: 'confirmado',
        notificado: false,
        notificarEm,
        fcmTokenCliente,
		formaPagamento: body.formaPagamento || 'local',
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { id: agendId };
  }
);