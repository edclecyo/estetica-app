import * as functions from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import axios from "axios";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// ─── 1. LEMBRETE AUTOMÁTICO (Agendado) ─────────
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

// ─── 2. NOTIFICAÇÃO DE MUDANÇA DE STATUS (Gatilho Automático) ─────────
export const onAgendamentoStatusChange = onDocumentUpdated("agendamentos/{docId}", async (event) => {
  const antes = event.data?.before.data();
  const depois = event.data?.after.data();

  if (!antes || !depois || antes.status === depois.status) return;

  const userSnap = await db.collection('usuarios').doc(depois.clienteUid).get();
  const token = userSnap.data()?.fcmToken;

  if (!token) return;

  let titulo = "";
  let corpo = "";

  if (depois.status === 'concluido') {
    titulo = "✅ Atendimento Concluído!";
    corpo = `Seu serviço de ${depois.servicoNome} foi finalizado. Avalie-nos!`;
  } else if (depois.status === 'cancelado') {
    titulo = "❌ Agendamento Cancelado";
    corpo = `Seu horário para ${depois.servicoNome} foi cancelado.`;
  }

  if (titulo) {
    await messaging.send({
      token,
      notification: { title: titulo, body: corpo },
      data: { tipo: 'status_change', id: event.params.docId }
    });
  }
});

// ─── 3. SALVAR/EDITAR ESTABELECIMENTO ─────────
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

// ─── 4. CRIAR AGENDAMENTO (Gera notificação para o Admin) ─────────
export const criarAgendamento = functions.onCall(async (request) => {
  const data = request.data;

  const estSnap = await db.collection('estabelecimentos').doc(data.estabelecimentoId).get();
  if (!estSnap.data()?.assinaturaAtiva) {
    throw new functions.HttpsError('failed-precondition', 'Sem assinatura');
  }

  if (!data.estabelecimentoId || !data.servicoId || !data.data || !data.horario) {
    throw new functions.HttpsError('invalid-argument', 'Campos faltando');
  }

  const agendRef = await db.collection('agendamentos').add({
    ...data,
    status: 'confirmado',
    notificado: false,
    visivelAdmin: true,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  const adminId = estSnap.data()?.adminId;

  if (adminId) {
    await db.collection('notificacoes').add({
      adminId,
      titulo: "Novo Agendamento! 📅",
      msg: `${data.clienteNome} agendou ${data.servicoNome} para ${data.data}.`,
      lida: false,
      apagada: false,
      criadoEm: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  return { id: agendRef.id };
});

// ─── 5. STATUS MANUAL (via App Admin) ─────────
export const concluirAgendamento = functions.onCall(async (request) => {
  const { agendamentoId } = request.data;
  await db.collection('agendamentos').doc(agendamentoId).update({ status: 'concluido' });
  return { ok: true };
});

export const cancelarAgendamento = functions.onCall(async (request) => {
  const { agendamentoId } = request.data;
  await db.collection('agendamentos').doc(agendamentoId).update({ status: 'cancelado' });
  return { ok: true };
});

// ─── 6. SISTEMA DE REPUTAÇÃO E MÉDIA ARITMÉTICA ─────────
export const atualizarReputacaoEAvaliacao = onDocumentUpdated("agendamentos/{docId}", async (event) => {
  const antes = event.data?.before.data();
  const depois = event.data?.after.data();

  if (!antes || !depois) return;

  const estRef = db.collection('estabelecimentos').doc(depois.estabelecimentoId);

  if (depois.status === 'concluido' && depois.avaliacaoCliente !== antes.avaliacaoCliente) {
    const novaNota = depois.avaliacaoCliente;

    await db.runTransaction(async (transaction) => {
      const estDoc = await transaction.get(estRef);
      if (!estDoc.exists) return;

      const dados = estDoc.data() || {};
      const totalAvaliacoes = (dados.quantidadeAvaliacoes || 0) + 1;
      const somaNotasAnterior = (dados.somaNotas || 0);
      const novaSoma = somaNotasAnterior + novaNota;
      const mediaFinal = novaSoma / totalAvaliacoes;

      transaction.update(estRef, {
        avaliacao: mediaFinal,
        quantidadeAvaliacoes: totalAvaliacoes,
        somaNotas: novaSoma,
        ultimaAtualizacao: admin.firestore.FieldValue.serverTimestamp()
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
        historicoCancelamento: admin.firestore.FieldValue.increment(1)
      });

      if (negativasAtuais === 10) {
        const adminId = dados.adminId;
        const adminSnap = await db.collection('usuarios').doc(adminId).get();
        const adminToken = adminSnap.data()?.fcmToken;

        if (adminToken) {
          await messaging.send({
            token: adminToken,
            notification: {
              title: "⚠️ Alerta de Reputação",
              body: `O local ${dados.nome} atingiu 10 avaliações negativas!`
            }
          });
        }
      }
    });
  }
});

// ─── 7. GESTÃO DE PLANOS, TRIAL E PAGAMENTOS ─────────
export const iniciarTrial = functions.onCall(async (req) => {
  const { estabelecimentoId } = req.data;
  const fim = new Date();
  fim.setDate(fim.getDate() + 14);

  await db.collection('estabelecimentos').doc(estabelecimentoId).update({
    plano: "trial",
    assinaturaAtiva: true,
    expiraEm: fim
  });
  return { ok: true };
});

export const verificarAssinaturas = onSchedule("every 24 hours", async () => {
  const agora = new Date();
  const snap = await db.collection('estabelecimentos')
    .where('expiraEm', '<=', agora)
    .get();

  const updates = snap.docs.map(d =>
    d.ref.update({ assinaturaAtiva: false, plano: "free" })
  );
  await Promise.all(updates);
});

export const criarAssinatura = functions.onCall(async (req) => {
  const { estabelecimentoId, email, plano } = req.data;
  const valores: any = { essencial: 30, pro: 70, elite: 150 };

  const res = await axios.post(
    "https://api.mercadopago.com/preapproval",
    {
      reason: `BeautyHub ${plano}`,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: valores[plano],
        currency_id: "BRL"
      },
      payer_email: email
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
      }
    }
  );

  await db.collection('estabelecimentos').doc(estabelecimentoId).update({
    assinaturaId: res.data.id
  });

  return { url: res.data.init_point };
});

export const webhookMercadoPago = functions.onRequest(async (req, res) => {
  const id = req.body.data?.id;

  const snap = await db.collection('estabelecimentos')
    .where('assinaturaId', '==', id)
    .get();

  if (snap.empty) {
    res.sendStatus(200);
    return; // Retorna void, não o res.sendStatus
  }

  const ref = snap.docs[0].ref;

  try {
    const resp = await axios.get(
      `https://api.mercadopago.com/preapproval/${id}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
        }
      }
    );

    const status = resp.data.status;

    await ref.update({
      assinaturaAtiva: status === "authorized",
      statusPagamento: status
    });

    res.sendStatus(200);
  } catch (error) {
    console.error("Erro no Webhook:", error);
    res.sendStatus(500);
  }
  
  return; // Garante que todos os caminhos retornam void
});

// ─── 8. RANKING E DESTAQUES ─────────
export const atualizarRanking = onSchedule("every 1 hours", async () => {
  const snap = await db.collection('estabelecimentos').get();
  const updates = snap.docs.map(doc => {
    const d = doc.data();
    const score = (d.avaliacao || 0) * 2 + (d.quantidadeAvaliacoes || 0) * 0.5 +
      (d.plano === "elite" ? 100 : d.plano === "pro" ? 50 : 0);
    return doc.ref.update({ rankingScore: score });
  });
  await Promise.all(updates);
});

export const comprarDestaque = functions.onCall(async (req) => {
  const { estabelecimentoId } = req.data;
  const fim = new Date();
  fim.setDate(fim.getDate() + 7);

  await db.collection('estabelecimentos').doc(estabelecimentoId).update({
    destaqueAtivo: true,
    destaqueExpira: fim
  });
  return { ok: true };
});

export const verificarDestaques = onSchedule("every 24 hours", async () => {
  const agora = new Date();
  const snap = await db.collection('estabelecimentos')
    .where('destaqueExpira', '<=', agora)
    .get();

  const updates = snap.docs.map(d =>
    d.ref.update({ destaqueAtivo: false })
  );
  await Promise.all(updates);
});

export const limparReputacaoMensal = onSchedule("0 0 1 * *", async (event) => {
  const estabelecimentosSnap = await db.collection('estabelecimentos')
    .where('avaliacoesNegativas', '>', 0)
    .get();

  const promessas = estabelecimentosSnap.docs.map(async (doc) => {
    const dados = doc.data();
    const negativasAtuais = dados.avaliacoesNegativas || 0;
    const novasNegativas = Math.max(0, negativasAtuais - 1);

    return doc.ref.update({
      avaliacoesNegativas: novasNegativas,
      ultimaLimpezaReputacao: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  await Promise.all(promessas);
});