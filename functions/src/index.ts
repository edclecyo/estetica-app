import * as functions from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler'; // Para o lembrete
import * as admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// ─── 1. LEMBRETE AUTOMÁTICO (Roda a cada 30 min) ─────────
// Envia notificação para usuários que têm agendamento na próxima hora
export const lembreteAgendamento = onSchedule("every 30 minutes", async (event) => {
  const agora = new Date();
  const proximaHora = new Date(agora.getTime() + 60 * 60 * 1000);

  // Formata a data atual para comparar (Ex: "18/03/2026")
  const dataHoje = agora.toLocaleDateString('pt-BR');

  const agendamentosSnap = await db.collection('agendamentos')
    .where('data', '==', dataHoje)
    .where('status', '==', 'confirmado')
    .where('notificado', '==', false) // Evita enviar duas vezes
    .get();

  const promessas = agendamentosSnap.docs.map(async (doc) => {
    const agend = doc.data();
    // Aqui você validaria se o 'agend.horario' está dentro da próxima hora
    // Se sim, busca o token do usuário e envia:
    
    const userSnap = await db.collection('usuarios').doc(agend.clienteUid).get();
    const token = userSnap.data()?.fcmToken;

    if (token) {
      await messaging.send({
        token,
        notification: {
          title: '⏰ Seu horário está chegando!',
          body: `Lembrete: Você tem ${agend.servicoNome} às ${agend.horario}. Te esperamos!`,
        }
      });
      return doc.ref.update({ notificado: true });
    }
    return null;
  });

  await Promise.all(promessas);
});

// ─── 2. LIMPAR AGENDAMENTOS CONCLUÍDOS ─────────
// Remove da visão do admin (marcando como 'arquivado'), mas mantém os dados para estatísticas
export const limparAgendamentosConcluidos = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', 'Acesso negado');
  
  const { estabelecimentoId } = request.data;
  
  const docsConcluidos = await db.collection('agendamentos')
    .where('estabelecimentoId', '==', estabelecimentoId)
    .where('status', '==', 'concluido')
    .get();

  const batch = db.batch();
  docsConcluidos.forEach(doc => {
    // Em vez de deletar, marcamos como oculto para o admin
    // assim você não perde os dados do seu Gráfico de Receita!
    batch.update(doc.ref, { visivelAdmin: false });
  });

  await batch.commit();
  return { ok: true, removidos: docsConcluidos.size };
});

// ─── 3. SALVAR/EDITAR ESTABELECIMENTO ─────────
export const salvarEstabelecimento = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', 'Acesso negado');

  const data = request.data;
  const adminId = request.auth.uid;
  const docId = data.estabelecimentoId || db.collection('estabelecimentos').doc().id;
  const estRef = db.collection('estabelecimentos').doc(docId);

  const payload = {
    ...data,
    adminId,
    lat: data.lat ? Number(data.lat) : null, // Importante para a HomeScreen
    lng: data.lng ? Number(data.lng) : null,
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
  };

  delete payload.estabelecimentoId;
  await estRef.set(payload, { merge: true });

  return { id: docId, ok: true };
});

// ─── 4. CRIAR AGENDAMENTO ─────────
export const criarAgendamento = functions.onCall(async (request) => {
  const { estabelecimentoId, servicoId, servicoNome, servicoPreco, data, horario, clienteNome, clienteUid } = request.data;

  if (!estabelecimentoId || !servicoId || !data || !horario || !clienteNome) {
    throw new functions.HttpsError('invalid-argument', 'Campos faltando');
  }

  const agendRef = await db.collection('agendamentos').add({
    estabelecimentoId,
    servicoId, servicoNome, servicoPreco,
    data, horario, clienteNome, clienteUid,
    status: 'confirmado',
    notificado: false, // Para o sistema de lembrete
    visivelAdmin: true, // Para o filtro de limpeza
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { id: agendRef.id };
});

// ─── 5. CONCLUIR AGENDAMENTO ─────────
export const concluirAgendamento = functions.onCall(async (request) => {
  const { agendamentoId } = request.data;
  await db.collection('agendamentos').doc(agendamentoId).update({ 
    status: 'concluido' 
  });
  return { ok: true };
});