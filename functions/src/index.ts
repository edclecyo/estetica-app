import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// ─── Criar Agendamento ───────────────────────────────────────────────
export const criarAgendamento = functions.onCall(async (request) => {
  const { estabelecimentoId, servicoId, servicoNome, servicoPreco, data, horario, clienteNome, clienteUid } = request.data;

  if (!estabelecimentoId || !servicoId || !data || !horario || !clienteNome) {
    throw new functions.HttpsError('invalid-argument', 'Campos obrigatórios faltando');
  }

  const conflito = await db.collection('agendamentos')
    .where('estabelecimentoId', '==', estabelecimentoId)
    .where('data', '==', data)
    .where('horario', '==', horario)
    .where('status', 'in', ['confirmado'])
    .get();

  if (!conflito.empty) {
    throw new functions.HttpsError('already-exists', 'Horário já ocupado');
  }

  const estabSnap = await db.collection('estabelecimentos').doc(estabelecimentoId).get();
  const estab = estabSnap.data();

  const agendRef = await db.collection('agendamentos').add({
    estabelecimentoId,
    estabelecimentoNome: estab?.nome || '',
    servicoId,
    servicoNome,
    servicoPreco,
    data,
    horario,
    clienteNome,
    clienteUid: clienteUid || null,
    status: 'confirmado',
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Cria notificação separada para o admin
  try {
    const adminId = estab?.adminId;
    if (adminId) {
      await db.collection('notificacoes').add({
        adminId,
        agendamentoId: agendRef.id,
        clienteNome,
        servicoNome,
        data,
        horario,
        status: 'confirmado',
        lida: false,
        apagada: false,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Envia push notification
      const adminSnap = await db.collection('admins').doc(adminId).get();
      const fcmToken = adminSnap.data()?.fcmToken;
      if (fcmToken) {
        await messaging.send({
          token: fcmToken,
          notification: {
            title: '📅 Novo Agendamento!',
            body: `${clienteNome} agendou ${servicoNome} para ${data} às ${horario}`,
          },
        });
      }
    }
  } catch (e) {
    console.log('Erro ao notificar admin:', e);
  }

  return { id: agendRef.id };
});

// ─── Cancelar Agendamento ────────────────────────────────────────────
export const cancelarAgendamento = functions.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.HttpsError('unauthenticated', 'Não autenticado');
  }

  const { agendamentoId } = request.data;
  const snap = await db.collection('agendamentos').doc(agendamentoId).get();
  const agend = snap.data();

  await db.collection('agendamentos').doc(agendamentoId).update({ status: 'cancelado' });

  // Cria notificação de cancelamento para o cliente
  try {
    if (agend?.clienteUid) {
      const clienteSnap = await db.collection('clientes').doc(agend.clienteUid).get();
      const fcmToken = clienteSnap.data()?.fcmToken;
      if (fcmToken) {
        await messaging.send({
          token: fcmToken,
          notification: {
            title: '❌ Agendamento Cancelado',
            body: `Seu agendamento de ${agend.servicoNome} em ${agend.data} foi cancelado`,
          },
        });
      }
    }
  } catch (e) {
    console.log('Erro ao notificar cliente:', e);
  }

  return { ok: true };
});

// ─── Salvar Estabelecimento ──────────────────────────────────────────
export const salvarEstabelecimento = functions.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.HttpsError('unauthenticated', 'Não autenticado');
  }

  const { estabelecimentoId, dados } = request.data;

  if (estabelecimentoId === 'novo') {
    const ref = await db.collection('estabelecimentos').add({
      ...dados,
      adminId: request.auth.uid,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { id: ref.id };
  } else {
    await db.collection('estabelecimentos').doc(estabelecimentoId).update(dados);
    return { id: estabelecimentoId };
  }
});