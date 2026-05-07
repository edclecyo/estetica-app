import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

import { db } from '../config/firebase';
import { REGION } from '../config/region';
import { parseDataHoraBR, planoAtivo, dataKey } from '../utils/helpers';
import { RATE_LIMIT_MS } from '../config/rateLimit';

// ─────────────────────────────────────────────
// 🚀 CRIAR AGENDAMENTO
// ─────────────────────────────────────────────
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
    const body = request.data || {};

    const {
      estabelecimentoId,
      servicoNome,
      clienteNome,
      data: dataBr,
      horario,
      formaPagamento,
    } = body;

    if (!estabelecimentoId || !servicoNome || !clienteNome || !dataBr || !horario) {
      throw new HttpsError('invalid-argument', 'Campos obrigatórios ausentes');
    }

    const estRef = db.collection('estabelecimentos').doc(estabelecimentoId);
    const rateRef = db.collection('rateLimit').doc(clienteUid);

    const key = dataKey(dataBr);

    let agendamentoId = '';

    await db.runTransaction(async (t) => {

      const rateSnap = await t.get(rateRef);
      const estSnap = await t.get(estRef);

      if (!estSnap.exists) {
        throw new HttpsError('not-found', 'Estabelecimento não encontrado');
      }

      const est = estSnap.data();

      if (!planoAtivo(est)) {
        throw new HttpsError('failed-precondition', 'Plano inativo');
      }

      const now = Date.now();

      if (rateSnap.exists) {
        const last = rateSnap.data()?.timestamp || 0;
        if (now - last < RATE_LIMIT_MS) {
          throw new HttpsError('resource-exhausted', 'Aguarde antes de agendar novamente.');
        }
      }

      const servicos = Array.isArray(est.servicos) ? est.servicos : [];

      const servico = servicos.find((s: any) =>
        String(s?.nome || '').trim() === String(servicoNome).trim()
      );

      if (!servico) {
        throw new HttpsError('invalid-argument', 'Serviço inválido');
      }

      parseDataHoraBR(dataBr, horario);

      const agRef = db.collection('agendamentos').doc();
      agendamentoId = agRef.id;

      t.set(rateRef, { timestamp: now }, { merge: true });

 // AGENDAMENTO
t.set(agRef, {
  estabelecimentoId,
  estabelecimentoNome: est?.nome || 'Estabelecimento',
  adminId: est?.adminId || null,

  servicoNome,
  servicoPreco: Number(servico.preco || 0),

  clienteNome,
  clienteUid,

  data: dataBr,
  dataKey: key,
  horario,

  status: 'confirmado',
  formaPagamento: formaPagamento || 'local',

  criadoEm: FieldValue.serverTimestamp(),
  atualizadoEm: FieldValue.serverTimestamp(),
});

// HORÁRIO OCUPADO
const horarioRef = db.collection('horariosOcupados').doc();

t.set(horarioRef, {
  estabelecimentoId,
  data: dataBr,
  horario,
  agendamentoId: agRef.id,
  criadoEm: FieldValue.serverTimestamp(),
});

// CLIENTE NOTIF
const notifCliente = db.collection('notificacoes').doc();

t.set(notifCliente, {
  clienteId: clienteUid,
  tipo: 'cliente',
  type: 'agendamento',
  agendamentoId: agRef.id,
  titulo: 'Agendamento confirmado',
  mensagem: `Seu horário de ${servicoNome} foi confirmado para ${dataBr} às ${horario}.`,
  lida: false,
  criadoEm: FieldValue.serverTimestamp(),
});

    });

    // PUSH CLIENTE
    const clienteSnap = await db.collection('clientes').doc(clienteUid).get();

    if (clienteSnap.exists) {
      const token = clienteSnap.data()?.fcmToken;

      if (token) {
        await admin.messaging().send({
          token,
          notification: {
            title: 'Agendamento confirmado',
            body: `Seu horário foi confirmado para ${horario}`,
          },
        });
      }
    }

    return { id: agendamentoId };
  }
);