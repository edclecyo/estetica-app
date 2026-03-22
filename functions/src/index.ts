import * as functions from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import axios from "axios";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();
// ─── CRIAR SUPER ADMIN (uso único) ─────────
export const criarSuperAdmin = functions.onCall(async (request) => {
  const { email, senha, nome, chaveSecreta } = request.data;

  // ✅ Chave secreta — só quem souber pode executar
  if (chaveSecreta !== 'BEAUTY_MASTER_2024') {
    throw new functions.HttpsError('permission-denied', 'Chave inválida.');
  }

  // ✅ Verifica se já existe um Super Admin — só permite um
  const superAdminSnap = await db.collection('admins')
    .where('cargo', '==', 'Super Admin')
    .limit(1)
    .get();

  if (!superAdminSnap.empty) {
    throw new functions.HttpsError(
      'already-exists',
      'Super Admin já existe. Esta função só pode ser executada uma vez.'
    );
  }

  // ✅ Cria o usuário no Firebase Auth
  const userRecord = await admin.auth().createUser({
    email,
    password: senha,
    displayName: nome,
  });

  // ✅ Salva no Firestore como Super Admin
  await db.collection('admins').doc(userRecord.uid).set({
    nome,
    email,
    cargo: 'Super Admin',
    ativo: true,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log('✅ Super Admin criado:', email, userRecord.uid);
  return { ok: true, uid: userRecord.uid };
});
// ─── HELPER: busca token do cliente ─────────
async function getTokenCliente(uid: string): Promise<string | null> {
  if (!uid) return null;
  const snap = await db.collection('clientes').doc(uid).get();
  return snap.data()?.fcmToken || null;
}

// ─── HELPER: busca token do admin pelo adminId ─────────
async function getTokenAdmin(adminId: string): Promise<string | null> {
  if (!adminId) return null;
  const snap = await db.collection('admins').doc(adminId).get();
  return snap.data()?.fcmToken || null;
}

// ─── HELPER: envia push com data payload ─────────
async function enviarPush(
  token: string,
  titulo: string,
  corpo: string,
  data?: Record<string, string>
) {
  try {
    const resultado = await messaging.send({
      token,
      notification: { title: titulo, body: corpo },
      ...(data && { data }),
    });
    console.log('✅ Push enviado. messageId:', resultado);
  } catch (e: any) {
    console.log('❌ Erro ao enviar push:', e.code, e.message);
    if (
      e.code === 'messaging/invalid-registration-token' ||
      e.code === 'messaging/registration-token-not-registered'
    ) {
      const clienteSnap = await db.collection('clientes')
        .where('fcmToken', '==', token).limit(1).get();
      if (!clienteSnap.empty) {
        await clienteSnap.docs[0].ref.update({ fcmToken: null });
        console.log('🗑️ Token inválido removido');
      }
    }
  }
}

// ─── HELPER: salva notificação para o cliente no Firestore ─────────
async function salvarNotifCliente(
  clienteUid: string,
  titulo: string,
  msg: string,
  tipo: string,
  extras?: Record<string, any>
) {
  await db.collection('notificacoes').add({
    clienteId: clienteUid,
    titulo,
    msg,
    tipo,
    lida: false,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    ...extras,
  });
}

// ─── 1. LEMBRETE AUTOMÁTICO ─────────
export const lembreteAgendamento = onSchedule("every 30 minutes", async () => {
  const agora = new Date();

  const snap = await db.collection('agendamentos')
    .where('status', '==', 'confirmado')
    .get();

  const promessas = snap.docs.map(async (doc) => {
    const agend = doc.data();
    if (!agend.clienteUid || !agend.data || !agend.horario) return null;

    const [dia, mes, ano] = agend.data.split('/').map(Number);
    const [hora, minuto] = agend.horario.split(':').map(Number);
    const dataAgend = new Date(ano, mes - 1, dia, hora, minuto);

    const diffMs = dataAgend.getTime() - agora.getTime();
    const diffHoras = diffMs / (1000 * 60 * 60);
    const diffDias = diffHoras / 24;

    let titulo = '';
    let msg = '';
    let tipoNotif = '';

    if (diffDias >= 1.9 && diffDias <= 2.1) {
      if (agend.notificado2dias) return null;
      titulo = '📅 Seu agendamento está chegando!';
      msg = `Daqui a 2 dias você tem ${agend.servicoNome} às ${agend.horario}. Te esperamos!`;
      tipoNotif = 'lembrete_2dias';
    } else if (diffHoras >= 2.9 && diffHoras <= 3.1) {
      if (agend.notificado3h) return null;
      titulo = '⏰ Faltam 3 horas!';
      msg = `Seu ${agend.servicoNome} hoje às ${agend.horario}. Não esqueça!`;
      tipoNotif = 'lembrete_3h';
    } else if (diffHoras >= 0.4 && diffHoras <= 0.6) {
      if (agend.notificado) return null;
      titulo = '🚨 Seu horário é em 30 minutos!';
      msg = `${agend.servicoNome} às ${agend.horario}. Estamos te esperando!`;
      tipoNotif = 'lembrete_30min';
    } else {
      return null;
    }

    await salvarNotifCliente(agend.clienteUid, titulo, msg, 'lembrete', {
      servicoNome: agend.servicoNome,
      data: agend.data,
      horario: agend.horario,
      tipoNotif,
    });

    const token = await getTokenCliente(agend.clienteUid);
    if (token) {
      await enviarPush(token, titulo, msg, { tela: 'agendamento', tipoNotif });
    }

    if (tipoNotif === 'lembrete_2dias') {
      return doc.ref.update({ notificado2dias: true });
    } else if (tipoNotif === 'lembrete_3h') {
      return doc.ref.update({ notificado3h: true });
    } else if (tipoNotif === 'lembrete_30min') {
      return doc.ref.update({ notificado: true });
    }

    return null;
  });

  await Promise.all(promessas);
});

// ─── 2. CONCLUSÃO AUTOMÁTICA após 1h do horário ─────────
export const concluirAgendamentosPassados = onSchedule("every 60 minutes", async () => {
  const agora = new Date();

  const snap = await db.collection('agendamentos')
    .where('status', '==', 'confirmado')
    .get();

  const promessas = snap.docs.map(async (doc) => {
    const agend = doc.data();
    if (!agend.data || !agend.horario) return null;

    const [dia, mes, ano] = agend.data.split('/').map(Number);
    const [hora, minuto] = agend.horario.split(':').map(Number);
    const dataAgend = new Date(ano, mes - 1, dia, hora, minuto);

    const diffMs = agora.getTime() - dataAgend.getTime();
    const diffHoras = diffMs / (1000 * 60 * 60);

    // ✅ Só conclui se passou mais de 1 hora do horário
    if (diffHoras < 1) return null;

    await doc.ref.update({ status: 'concluido' });
    console.log('✅ Agendamento auto-concluído:', doc.id);

    if (!agend.clienteUid || agend.clienteUid === agend.adminId) return null;

    const titulo = '⭐ Como foi seu atendimento?';
    const msg = `Seu ${agend.servicoNome} já aconteceu! Deixe sua avaliação e ajude outros clientes.`;

    // ✅ Salva notificação com dados para navegar direto à avaliação
    await salvarNotifCliente(agend.clienteUid, titulo, msg, 'concluido_auto', {
      servicoNome: agend.servicoNome,
      data: agend.data,
      horario: agend.horario,
      agendamentoId: doc.id,
      estabelecimentoId: agend.estabelecimentoId,
      estabelecimentoNome: agend.estabelecimentoNome,
    });

    const token = await getTokenCliente(agend.clienteUid);
    if (token) {
      await enviarPush(token, titulo, msg, {
        tela: 'agendamento',
        tipo: 'concluido_auto',
        id: doc.id,
      });
    }

    return null;
  });

  await Promise.all(promessas);
});

// ─── 3. NOTIFICAÇÃO DE MUDANÇA DE STATUS (trigger) ─────────
export const onAgendamentoStatusChange = onDocumentUpdated("agendamentos/{docId}", async (event) => {
  const antes = event.data?.before.data();
  const depois = event.data?.after.data();

  if (!antes || !depois || antes.status === depois.status) return;

  if (depois.status === 'concluido' || depois.status === 'cancelado') {
    console.log('Status concluido/cancelado — tratado pelas funções manuais, trigger ignorado');
    return;
  }

  const clienteUid = depois.clienteUid;
  const adminId = depois.adminId;

  if (!clienteUid || clienteUid === adminId) {
    console.log('clienteUid igual ao adminId ou vazio — notificação ignorada');
    return;
  }

  console.log('Status change não tratado pelo trigger:', depois.status);
});

// ─── 4. SALVAR/EDITAR ESTABELECIMENTO ─────────
export const salvarEstabelecimento = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', 'Acesso negado');

  const data = request.data;
  const adminId = request.auth.uid;

  const docId = data.estabelecimentoId || db.collection('estabelecimentos').doc().id;
  const estRef = db.collection('estabelecimentos').doc(docId);

  const payload: any = {
    ...data,
    adminId,
    lat: data.lat ? Number(data.lat) : (data.coords?.lat ? Number(data.coords.lat) : null),
    lng: data.lng ? Number(data.lng) : (data.coords?.lng ? Number(data.coords.lng) : null),
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
  };

  delete payload.estabelecimentoId;
  if (payload.coords) delete payload.coords;

  await estRef.set(payload, { merge: true });
  return { id: docId, ok: true };
});

// ─── 5. CRIAR AGENDAMENTO ─────────
export const criarAgendamento = functions.onCall(async (request) => {
  const data = request.data;

  const estSnap = await db.collection('estabelecimentos').doc(data.estabelecimentoId).get();
  if (!estSnap.data()?.assinaturaAtiva) {
    throw new functions.HttpsError('failed-precondition', 'Sem assinatura');
  }
  if (!data.estabelecimentoId || !data.servicoId || !data.data || !data.horario) {
    throw new functions.HttpsError('invalid-argument', 'Campos faltando');
  }

  const adminId = estSnap.data()?.adminId;

  await db.collection('agendamentos').add({
    ...data,
    adminId,
    status: 'confirmado',
    notificado: false,
    visivelAdmin: true,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (adminId) {
    await db.collection('notificacoes').add({
      adminId,
      titulo: 'Novo Agendamento! 📅',
      msg: `${data.clienteNome} agendou ${data.servicoNome} para ${data.data}.`,
      clienteNome: data.clienteNome,
      servicoNome: data.servicoNome,
      data: data.data,
      horario: data.horario,
      status: 'confirmado',
      lida: false,
      apagada: false,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    const tokenAdmin = await getTokenAdmin(adminId);
    if (tokenAdmin) {
      await enviarPush(
        tokenAdmin,
        'Novo Agendamento! 📅',
        `${data.clienteNome} agendou ${data.servicoNome} para ${data.data}.`,
        { tela: 'dash' }
      );
    }
  }

  return { ok: true };
});

// ─── 6. STATUS MANUAL ─────────
export const concluirAgendamento = functions.onCall(async (request) => {
  const { agendamentoId } = request.data;

  console.log('🔵 concluirAgendamento chamado:', agendamentoId);

  const agendSnap = await db.collection('agendamentos').doc(agendamentoId).get();
  const agend = agendSnap.data();

  console.log('📋 Agendamento:', JSON.stringify({
    clienteUid: agend?.clienteUid || 'VAZIO',
    adminId: agend?.adminId || 'VAZIO',
    servicoNome: agend?.servicoNome,
    saoIguais: agend?.clienteUid === agend?.adminId,
  }));

  await db.collection('agendamentos').doc(agendamentoId).update({ status: 'concluido' });

  if (agend?.clienteUid && agend.clienteUid !== agend.adminId) {
    const titulo = '✅ Atendimento Concluído!';
    const msg = `Seu serviço de ${agend.servicoNome} foi finalizado. Como foi? Deixe sua avaliação!`;

    // ✅ Salva com agendamentoId e estabelecimentoId para o botão de avaliação
    await salvarNotifCliente(agend.clienteUid, titulo, msg, 'concluido', {
      servicoNome: agend.servicoNome,
      data: agend.data,
      horario: agend.horario,
      agendamentoId: agendamentoId,
      estabelecimentoId: agend.estabelecimentoId,
      estabelecimentoNome: agend.estabelecimentoNome,
    });

    const tokenCliente = await getTokenCliente(agend.clienteUid);
    console.log('🔑 Token:', tokenCliente ? tokenCliente.substring(0, 25) + '...' : 'NULL');

    if (tokenCliente) {
      await enviarPush(tokenCliente, titulo, msg, {
        tela: 'agendamento',
        tipo: 'concluido',
        id: agendamentoId,
      });
    }
  }

  return { ok: true };
});

export const cancelarAgendamento = functions.onCall(async (request) => {
  const { agendamentoId } = request.data;

  const agendSnap = await db.collection('agendamentos').doc(agendamentoId).get();
  const agend = agendSnap.data();

  await db.collection('agendamentos').doc(agendamentoId).update({ status: 'cancelado' });

  if (agend?.clienteUid && agend.clienteUid !== agend.adminId) {
    const titulo = '❌ Agendamento Cancelado';
    const msg = `Seu horário para ${agend.servicoNome} em ${agend.data} foi cancelado.`;

    await salvarNotifCliente(agend.clienteUid, titulo, msg, 'cancelado', {
      servicoNome: agend.servicoNome,
      data: agend.data,
      horario: agend.horario,
    });

    const tokenCliente = await getTokenCliente(agend.clienteUid);
    if (tokenCliente) {
      await enviarPush(tokenCliente, titulo, msg, {
        tela: 'agendamento',
        tipo: 'cancelado',
        id: agendamentoId,
      });
    }
  }

  return { ok: true };
});

// ─── 7. REPUTAÇÃO E AVALIAÇÃO ─────────
export const atualizarReputacaoEAvaliacao = onDocumentUpdated("agendamentos/{docId}", async (event) => {
  const antes = event.data?.before.data();
  const depois = event.data?.after.data();
  if (!antes || !depois) return;

  const estRef = db.collection('estabelecimentos').doc(depois.estabelecimentoId);

  if (depois.avaliacaoCliente !== antes.avaliacaoCliente && depois.avaliacaoCliente) {
    await db.runTransaction(async (transaction) => {
      const estDoc = await transaction.get(estRef);
      if (!estDoc.exists) return;

      const dados = estDoc.data() || {};
      const totalAvaliacoes = (dados.quantidadeAvaliacoes || 0) + 1;
      const novaSoma = (dados.somaNotas || 0) + depois.avaliacaoCliente;

      transaction.update(estRef, {
        avaliacao: novaSoma / totalAvaliacoes,
        quantidadeAvaliacoes: totalAvaliacoes,
        somaNotas: novaSoma,
        ultimaAtualizacao: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  }

  if (depois.status === 'cancelado' && antes.status !== 'cancelado') {
    await db.runTransaction(async (transaction) => {
      const estDoc = await transaction.get(estRef);
      if (!estDoc.exists) return;

      const dados = estDoc.data() || {};
      const negativasAtuais = (dados.avaliacoesNegativas || 0) + 1;

      transaction.update(estRef, {
        avaliacoesNegativas: negativasAtuais,
        historicoCancelamento: admin.firestore.FieldValue.increment(1),
      });

      if (negativasAtuais === 10) {
        const tokenAdmin = await getTokenAdmin(dados.adminId);
        if (tokenAdmin) {
          await enviarPush(
            tokenAdmin,
            '⚠️ Alerta de Reputação',
            `O local ${dados.nome} atingiu 10 avaliações negativas!`,
            { tela: 'dash' }
          );
        }
      }
    });
  }
});

// ─── 8. PLANOS E PAGAMENTOS ─────────
export const iniciarTrial = functions.onCall(async (req) => {
  const { estabelecimentoId } = req.data;
  const fim = new Date();
  fim.setDate(fim.getDate() + 14);
  await db.collection('estabelecimentos').doc(estabelecimentoId).update({
    plano: 'trial', assinaturaAtiva: true, expiraEm: fim,
  });
  return { ok: true };
});

export const verificarAssinaturas = onSchedule("every 24 hours", async () => {
  const agora = new Date();
  const snap = await db.collection('estabelecimentos').where('expiraEm', '<=', agora).get();
  await Promise.all(snap.docs.map(d => d.ref.update({ assinaturaAtiva: false, plano: 'free' })));
});

export const criarAssinatura = functions.onCall(async (req) => {
  const { estabelecimentoId, email, plano } = req.data;
  const valores: any = { essencial: 30, pro: 70, elite: 150 };

  const res = await axios.post(
    'https://api.mercadopago.com/preapproval',
    {
      reason: `BeautyHub ${plano}`,
      auto_recurring: {
        frequency: 1, frequency_type: 'months',
        transaction_amount: valores[plano], currency_id: 'BRL',
      },
      payer_email: email,
    },
    { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
  );

  await db.collection('estabelecimentos').doc(estabelecimentoId).update({
    assinaturaId: res.data.id,
  });
  return { url: res.data.init_point };
});

export const webhookMercadoPago = functions.onRequest(async (req, res) => {
  const id = req.body.data?.id;
  const snap = await db.collection('estabelecimentos').where('assinaturaId', '==', id).get();

  if (snap.empty) { res.sendStatus(200); return; }

  try {
    const resp = await axios.get(
      `https://api.mercadopago.com/preapproval/${id}`,
      { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
    );
    await snap.docs[0].ref.update({
      assinaturaAtiva: resp.data.status === 'authorized',
      statusPagamento: resp.data.status,
    });
    res.sendStatus(200);
  } catch (error) {
    console.error('Erro no Webhook:', error);
    res.sendStatus(500);
  }
});

// ─── 9. RANKING E DESTAQUES ─────────
export const atualizarRanking = onSchedule("every 1 hours", async () => {
  const snap = await db.collection('estabelecimentos').get();
  await Promise.all(snap.docs.map(doc => {
    const d = doc.data();
    const score = (d.avaliacao || 0) * 2 + (d.quantidadeAvaliacoes || 0) * 0.5 +
      (d.plano === 'elite' ? 100 : d.plano === 'pro' ? 50 : 0);
    return doc.ref.update({ rankingScore: score });
  }));
});

export const comprarDestaque = functions.onCall(async (req) => {
  const { estabelecimentoId } = req.data;
  const fim = new Date();
  fim.setDate(fim.getDate() + 7);
  await db.collection('estabelecimentos').doc(estabelecimentoId).update({
    destaqueAtivo: true, destaqueExpira: fim,
  });
  return { ok: true };
});

export const verificarDestaques = onSchedule("every 24 hours", async () => {
  const agora = new Date();
  const snap = await db.collection('estabelecimentos').where('destaqueExpira', '<=', agora).get();
  await Promise.all(snap.docs.map(d => d.ref.update({ destaqueAtivo: false })));
});

export const limparReputacaoMensal = onSchedule("0 0 1 * *", async () => {
  const snap = await db.collection('estabelecimentos').where('avaliacoesNegativas', '>', 0).get();
  await Promise.all(snap.docs.map(doc => {
    const negativasAtuais = doc.data().avaliacoesNegativas || 0;
    return doc.ref.update({
      avaliacoesNegativas: Math.max(0, negativasAtuais - 1),
      ultimaLimpezaReputacao: admin.firestore.FieldValue.serverTimestamp(),
    });
  }));
});