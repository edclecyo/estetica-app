import * as functions from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// ─── 1. LEMBRETE AUTOMÁTICO (Mantido) ─────────
export const lembreteAgendamento = onSchedule("every 30 minutes", async (event) => {
  const agora = new Date();
  const dataHoje = agora.toLocaleDateString('pt-BR');

  const agendamentosSnap = await db.collection('agendamentos')
    .where('data', '==', dataHoje)
    .where('status', '==', 'confirmado')
    .where('notificado', '==', false)
    .get();

  const promessas = agendamentosSnap.docs.map(async (doc) => {
    const agend = doc.data();
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

// ─── 2. LIMPAR AGENDAMENTOS (Mantido) ─────────
export const limparAgendamentosConcluidos = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', 'Acesso negado');
  
  const { estabelecimentoId } = request.data;
  const docsConcluidos = await db.collection('agendamentos')
    .where('estabelecimentoId', '==', estabelecimentoId)
    .where('status', '==', 'concluido')
    .get();

  const batch = db.batch();
  docsConcluidos.forEach(doc => {
    batch.update(doc.ref, { visivelAdmin: false });
  });

  await batch.commit();
  return { ok: true, removidos: docsConcluidos.size };
});

// ─── 3. SALVAR/EDITAR ESTABELECIMENTO (AJUSTADO) ─────────
export const salvarEstabelecimento = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', 'Acesso negado');

  const data = request.data;
  const adminId = request.auth.uid;
  
  // Define o ID do documento ou gera um novo
  const docId = data.estabelecimentoId || db.collection('estabelecimentos').doc().id;
  const estRef = db.collection('estabelecimentos').doc(docId);

  // Prepara o payload aceitando os novos campos de endereço
  const payload: any = {
    ...data,
    adminId,
    // Garante que as coordenadas sejam salvas como números, caso existam
    coords: data.coords ? {
      lat: Number(data.coords.lat),
      lng: Number(data.coords.lng)
    } : null,
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Remove o ID do corpo do objeto para não duplicar dentro do documento
  delete payload.estabelecimentoId;

  // Salva no Firestore usando merge: true para não apagar campos não enviados
  await estRef.set(payload, { merge: true });

  return { id: docId, ok: true };
});

// ─── 4. CRIAR AGENDAMENTO (Mantido) ─────────
export const criarAgendamento = functions.onCall(async (request) => {
  const { 
    estabelecimentoId, servicoId, servicoNome, servicoPreco, 
    data, horario, clienteNome, clienteUid 
  } = request.data;

  if (!estabelecimentoId || !servicoId || !data || !horario || !clienteNome) {
    throw new functions.HttpsError('invalid-argument', 'Campos faltando');
  }

  const agendRef = await db.collection('agendamentos').add({
    estabelecimentoId,
    servicoId, servicoNome, servicoPreco,
    data, horario, clienteNome, clienteUid,
    status: 'confirmado',
    notificado: false,
    visivelAdmin: true,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { id: agendRef.id };
});

// ─── 5. CONCLUIR AGENDAMENTO (Mantido) ─────────
export const concluirAgendamento = functions.onCall(async (request) => {
  const { agendamentoId } = request.data;
  if (!agendamentoId) throw new functions.HttpsError('invalid-argument', 'ID faltando');

  await db.collection('agendamentos').doc(agendamentoId).update({ 
    status: 'concluido' 
  });
  return { ok: true };
});