import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

import { db } from '../config/firebase';
import { REGION } from '../config/region';
import { parseDataHoraBR, planoAtivo, dataKey } from '../utils/helpers';
import { getTokenUsuario as getTokenCliente } from './notificacao.service';
import { RATE_LIMIT_MS } from '../config/rateLimit';

// 🔒 NORMALIZAÇÃO (AUTO EXPIRA TRIAL)
function normalizarPlano(est: any, t: any, ref: any): boolean {
  const agora = new Date();
  const expira = est?.expiraEm?.toDate?.();

  if (
    est?.plano === 'trial' &&
    expira &&
    expira.getTime() <= agora.getTime()
  ) {
    t.update(ref, {
      assinaturaAtiva: false,
      statusPlano: 'expirado',
    });

    return false;
  }

  return true;
}

export const criarAgendamento = onCall(
  {
    region: REGION,
    maxInstances: 50
  },
  async (request) => {

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Acesso negado');
    }

    const body = request.data || {};
    const clienteUid = request.auth.uid;

    const {
      estabelecimentoId,
      servicoNome,
      clienteNome,
      data: dataBr,
      horario
    } = body;

    if (!estabelecimentoId || !servicoNome || !clienteNome || !dataBr || !horario) {
      throw new HttpsError('invalid-argument', 'Campos obrigatórios ausentes');
    }

    // 🔒 VALIDAÇÃO GLOBAL DE PLANO (PADRÃO SaaS)
    const estRef = db.collection('estabelecimentos').doc(estabelecimentoId);

    const est = await db.runTransaction(async (t) => {
      const estSnap = await t.get(estRef);

      if (!estSnap.exists) {
        throw new HttpsError('not-found', 'Estabelecimento não encontrado');
      }

      const data = estSnap.data();

      const valido = normalizarPlano(data, t, estRef);

      if (!valido || !planoAtivo(data)) {
        throw new HttpsError('failed-precondition', 'Plano inativo');
      }

      return data;
    });

    // ─────────────────────────────────────────

    const partes = String(dataBr).split("/");
    if (partes.length !== 3) {
      throw new HttpsError('invalid-argument', 'Formato de data inválido');
    }

    const [dia, mes, ano] = partes;
    const mesRef = `${ano}_${String(mes).padStart(2, "0")}`;

    const servicos = Array.isArray(est.servicos) ? est.servicos : [];

    const servico = servicos.find((s: any) =>
      String(s?.nome || "").trim() === String(servicoNome).trim()
    );

    if (!servico) {
      throw new HttpsError('invalid-argument', 'Serviço inválido');
    }

    const dataHora = parseDataHoraBR(String(dataBr), String(horario));

    const notificarEm = Timestamp.fromDate(
      new Date(dataHora.getTime() - 60 * 60 * 1000)
    );

    let fcmTokenCliente = null;

    try {
      fcmTokenCliente = await getTokenCliente(clienteUid);
    } catch {}

    const uniqueId = `${clienteUid}_${dataBr}_${horario}`;

    const lockRef = db.collection('agendamentoLocks').doc(uniqueId);

    const key = dataKey(dataBr);

const conflitoRef = db.collection('horariosOcupados')
  .doc(`${estabelecimentoId}_${key}_${horario}`);

    const rateRef = db.collection('rateLimit').doc(clienteUid);

    const expiraDoc = new Date();
    expiraDoc.setDate(expiraDoc.getDate() + 2);

    let agendId = '';

    await db.runTransaction(async (t) => {

      const [rateSnap, lockSnap, conflitoSnap] = await Promise.all([
        t.get(rateRef),
        t.get(lockRef),
        t.get(conflitoRef)
      ]);

      const now = Date.now();

      // 🚫 RATE LIMIT
      if (rateSnap.exists) {
        const last = rateSnap.data()?.timestamp || 0;
        if (now - last < RATE_LIMIT_MS) {
          throw new HttpsError('resource-exhausted', 'Aguarde antes de agendar novamente.');
        }
      }

      // 🔒 LOCK DUPLICADO
      if (lockSnap.exists) {
        throw new HttpsError('already-exists', 'Agendamento já em processamento.');
      }

      // ⛔ CONFLITO DE HORÁRIO
      if (conflitoSnap.exists) {
        throw new HttpsError('already-exists', 'Horário já ocupado.');
      }

      const agendRef = db.collection('agendamentos').doc();
      agendId = agendRef.id;

      t.set(rateRef, { timestamp: now }, { merge: true });

      t.set(lockRef, {
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        expiraEm: Timestamp.fromDate(expiraDoc)
      });

      t.set(conflitoRef, {
  estabelecimentoId, // 👈 ADICIONA ISSO
  data: dataBr,
  horario,
  criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  expiraEm: Timestamp.fromDate(expiraDoc)
});

      t.set(agendRef, {
  estabelecimentoId,
  estabelecimentoNome: est?.nome || "Estabelecimento",
  adminId: est?.adminId || null,
  servicoId: servico.id || null,
  servicoNome: servico.nome,
  servicoPreco: Number(servico.preco || 0),
  clienteNome: String(clienteNome).substring(0, 100),
  clienteUid,
  data: dataBr,
  dataKey: key, // 👈 AQUI
  horario,
  mesRef,
  status: 'confirmado',
  notificado: false,
  deletado: false,
  notificarEm,
  fcmTokenCliente,
  formaPagamento: body.formaPagamento || 'local',
  criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
});
    });

    return { id: agendId };
  }
);