import * as functions from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import axios from "axios";
import * as crypto from "crypto";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();
const REGION = "southamerica-east1";

function parseDataHoraBR(data: string, horario: string): Date {
  const dataStr = String(data || "").trim();
  const horarioStr = String(horario || "").trim();
  const [diaStr, mesStr, anoStr] = dataStr.split("/");
  const [horaStr, minutoStr] = horarioStr.split(":");

  const dia = Number(diaStr);
  const mes = Number(mesStr);
  const ano = Number(anoStr);
  const hora = Number(horaStr);
  const minuto = Number(minutoStr);

  const date = new Date(ano, mes - 1, dia, hora, minuto, 0, 0);

  if (
    !Number.isFinite(dia) || !Number.isFinite(mes) || !Number.isFinite(ano) ||
    !Number.isFinite(hora) || !Number.isFinite(minuto) ||
    date.getFullYear() !== ano ||
    date.getMonth() !== mes - 1 ||
    date.getDate() !== dia
  ) {
    throw new functions.HttpsError("invalid-argument", "Data/horário inválidos.");
  }

  return date;
}

function validarAssinaturaMercadoPago(
  assinaturaHeader: string | undefined,
  requestIdHeader: string | undefined,
  dataId: string,
  segredo: string
): boolean {
  if (!assinaturaHeader || !requestIdHeader || !dataId || !segredo) return false;

  const parts = assinaturaHeader.split(",").map((p) => p.trim());
  const kv: Record<string, string> = {};
  for (const part of parts) {
    const [k, v] = part.split("=", 2);
    if (k && v) kv[k.trim()] = v.trim();
  }

  const ts = kv.ts;
  const v1 = kv.v1;
  if (!ts || !v1) return false;

  const manifesto = `id:${dataId};request-id:${requestIdHeader};ts:${ts};`;
  const assinaturaEsperada = crypto
    .createHmac("sha256", segredo)
    .update(manifesto)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(assinaturaEsperada), Buffer.from(v1));
  } catch {
    return false;
  }
}

// ─── HELPER: busca token do cliente ─────────
async function getTokenCliente(uid: string): Promise<string | null> {
  const snap = await db.collection('clientes').doc(uid).get();
  return snap.data()?.fcmToken || null;
}

// ─── HELPER: busca token do admin pelo adminId ─────────
async function getTokenAdmin(adminId: string): Promise<string | null> {
  const snap = await db.collection('admins').doc(adminId).get();
  return snap.data()?.fcmToken || null;
}

// ─── HELPER: envia push com data payload ─────────
async function enviarPush(token: string, titulo: string, corpo: string, data?: Record<string, string>) {
  try {
    await messaging.send({
      token,
      notification: { title: titulo, body: corpo },
      ...(data && { data }),
    });
  } catch (e) {
    console.log('Erro push:', e);
  }
}

// ─── 1. LEMBRETE OTIMIZADO ─────────
export const lembreteAgendamento = onSchedule(
  { region: REGION, schedule: "every 6 hours" },
  async () => {

    const agora = admin.firestore.Timestamp.now();

    const snap = await db.collection('agendamentos')
      .where('notificarEm', '<=', agora)
      .where('notificado', '==', false)
      .limit(100)
      .get();

    const promises: Array<Promise<void>> = snap.docs.map(async (doc) => {
      const agend = doc.data();

      if (!agend.fcmTokenCliente) return;

      await enviarPush(
        agend.fcmTokenCliente,
        '⏰ Seu horário está chegando!',
        `Lembrete: ${agend.servicoNome} às ${agend.horario}`,
        { tela: 'agendamento' }
      );

      await doc.ref.update({ notificado: true });
    });

    await Promise.all(promises);
  }
);

// ─── 2. STATUS + RANKING JUNTO ─────────
export const onAgendamentoUpdate = onDocumentUpdated(
  { document: "agendamentos/{docId}", region: REGION },
  async (event) => {

    const antes = event.data?.before.data();
    const depois = event.data?.after.data();
    if (!antes || !depois) return;

    // ─── PUSH STATUS ─────────
    if (antes.status !== depois.status && depois.fcmTokenCliente) {
      let titulo = '';
      let corpo = '';

      if (depois.status === 'concluido') {
        titulo = '✅ Atendimento Concluído!';
        corpo = `Avalie ${depois.servicoNome}`;
      } else if (depois.status === 'cancelado') {
        titulo = '❌ Agendamento Cancelado';
        corpo = `${depois.servicoNome} foi cancelado`;
      }

      if (titulo) {
        await enviarPush(depois.fcmTokenCliente, titulo, corpo, {
          tela: 'agendamento',
        });
      }
    }

    // ─── REPUTAÇÃO + RANKING (SEM SCHEDULER) ─────────
    if (depois.status === 'concluido' && depois.avaliacaoCliente !== antes.avaliacaoCliente) {

      const estRef = db.collection('estabelecimentos').doc(depois.estabelecimentoId);

      await db.runTransaction(async (t) => {
        const estDoc = await t.get(estRef);
        if (!estDoc.exists) return;

        const d = estDoc.data() || {};

        const total = (d.quantidadeAvaliacoes || 0) + 1;
        const soma = (d.somaNotas || 0) + depois.avaliacaoCliente;

        const novaMedia = soma / total;

        const ranking =
          novaMedia * 2 +
          total * 0.5 +
          (d.plano === 'elite' ? 100 : d.plano === 'pro' ? 50 : 0);

        t.update(estRef, {
          avaliacao: novaMedia,
          quantidadeAvaliacoes: total,
          somaNotas: soma,
          rankingScore: ranking,
        });
      });
    }
  }
);

// ─── 3. SALVAR/EDITAR ESTABELECIMENTO ─────────
export const salvarEstabelecimento = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', 'Acesso negado');

  const data = request.data;
  const adminId = request.auth.uid;

  const docId = data.estabelecimentoId || db.collection('estabelecimentos').doc().id;
  const estRef = db.collection('estabelecimentos').doc(docId);

  if (data.estabelecimentoId) {
    const existing = await estRef.get();
    if (existing.exists && existing.data()?.adminId !== adminId) {
      throw new functions.HttpsError('permission-denied', 'Você não pode editar este estabelecimento');
    }
  }

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

// ─── 4. CRIAR AGENDAMENTO OTIMIZADO ─────────
export const criarAgendamento = functions.onCall(async (request) => {
  // ✅ FIX: validação de autenticação adicionada
  if (!request.auth) throw new functions.HttpsError('unauthenticated', 'Acesso negado');

  const data = request.data || {};
  const clienteUid = request.auth.uid;
  const estabelecimentoId = String(data.estabelecimentoId || "");
  const servicoNome = String(data.servicoNome || "").trim();
  const clienteNome = String(data.clienteNome || "").trim();
  const dataBr = String(data.data || "").trim();
  const horario = String(data.horario || "").trim();

  if (!estabelecimentoId || !servicoNome || !clienteNome || !dataBr || !horario) {
    throw new functions.HttpsError('invalid-argument', 'Campos obrigatórios ausentes');
  }

  const estSnap = await db.collection('estabelecimentos')
    .doc(estabelecimentoId)
    .get();

  if (!estSnap.exists) {
    throw new functions.HttpsError('not-found', 'Estabelecimento não encontrado');
  }
  const est = estSnap.data() || {};

  if (!est.assinaturaAtiva) {
    throw new functions.HttpsError('failed-precondition', 'Sem assinatura');
  }

  const servicos = Array.isArray(est.servicos) ? est.servicos : [];
  const servico = servicos.find((s: any) => String(s?.nome || "").trim() === servicoNome);
  if (!servico) {
    throw new functions.HttpsError('invalid-argument', 'Serviço inválido para este estabelecimento');
  }

  const dataHora = parseDataHoraBR(dataBr, horario);
  const notificarEmDate = new Date(dataHora.getTime() - (60 * 60 * 1000)); // 1h antes

  // ✅ FIX: convertido para Timestamp do Firestore corretamente
  const notificarEm = admin.firestore.Timestamp.fromDate(notificarEmDate);
  const fcmTokenCliente = await getTokenCliente(clienteUid);

  const agendRef = await db.collection('agendamentos').add({
    estabelecimentoId,
    estabelecimentoNome: est.nome || data.estabelecimentoNome || "Estabelecimento",
    adminId: est.adminId || null,
    servicoId: servico.id || data.servicoId || null,
    servicoNome: servico.nome || servicoNome,
    servicoPreco: Number(servico.preco || 0),
    clienteNome,
    clienteUid,
    data: dataBr,
    horario,
    status: 'confirmado',
    notificado: false,
    notificarEm,
    fcmTokenCliente,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { id: agendRef.id };
});

// ─── 5. STATUS MANUAL ─────────
export const concluirAgendamento = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', 'Acesso negado');

  const { agendamentoId } = request.data;
  const agendRef = db.collection('agendamentos').doc(agendamentoId);
  const snap = await agendRef.get();

  if (!snap.exists) {
    throw new functions.HttpsError('not-found', 'Agendamento não encontrado');
  }

  // Validação: apenas o admin do estabelecimento pode concluir
  if (snap.data()?.adminId !== request.auth.uid) {
    throw new functions.HttpsError('permission-denied', 'Você não tem permissão');
  }

  await agendRef.update({ status: 'concluido' });
  return { ok: true };
});

// ─── 6. SCHEDULER ÚNICO (TUDO JUNTO) ─────────
export const manutencaoDiaria = onSchedule(
  { region: REGION, schedule: "every 24 hours" },
  async () => {

    const agora = new Date();

    const [exp, dest] = await Promise.all([
      db.collection('estabelecimentos').where('expiraEm', '<=', agora).get(),
      db.collection('estabelecimentos').where('destaqueExpira', '<=', agora).get(),
    ]);

    const batch = db.batch();

    exp.docs.forEach(d => {
      batch.update(d.ref, { assinaturaAtiva: false });
    });

    dest.docs.forEach(d => {
      batch.update(d.ref, { destaqueAtivo: false });
    });

    // ✅ FIX: try/catch para garantir log em caso de falha parcial
    try {
      await batch.commit();
    } catch (e) {
      console.error('Erro no batch da manutenção diária:', e);
      throw e;
    }
  }
);

// ─── 7. PLANOS E PAGAMENTOS ─────────
export const iniciarTrial = functions.onCall(async (req) => {
  if (!req.auth) throw new functions.HttpsError('unauthenticated', 'Acesso negado');
  const { estabelecimentoId } = req.data;
  if (!estabelecimentoId) {
    throw new functions.HttpsError('invalid-argument', 'estabelecimentoId é obrigatório');
  }

  const estRef = db.collection('estabelecimentos').doc(estabelecimentoId);
  const estSnap = await estRef.get();
  if (!estSnap.exists) {
    throw new functions.HttpsError('not-found', 'Estabelecimento não encontrado');
  }
  if (estSnap.data()?.adminId !== req.auth.uid) {
    throw new functions.HttpsError('permission-denied', 'Você não pode iniciar trial deste estabelecimento');
  }

  const fim = new Date();
  fim.setDate(fim.getDate() + 14);
  await estRef.update({
    plano: 'trial', assinaturaAtiva: true, expiraEm: fim,
  });
  return { ok: true };
});

export const webhookMercadoPago = functions.onRequest(async (req, res) => {
  const segredoWebhook = process.env.MP_WEBHOOK_SECRET;
  const tokenWebhook = process.env.MP_WEBHOOK_TOKEN;
  const tokenQuery = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;
  if (tokenWebhook && tokenQuery !== tokenWebhook) {
    res.sendStatus(401);
    return;
  }

  const { action, data } = req.body;

  if (action !== "subscription.updated" || !data?.id) {
    res.sendStatus(200);
    return;
  }

  // ✅ FIX: `id` extraído corretamente de `data.id`
  const id: string = data.id;

  if (segredoWebhook) {
    const assinaturaHeader = typeof req.headers["x-signature"] === "string"
      ? req.headers["x-signature"]
      : undefined;
    const requestIdHeader = typeof req.headers["x-request-id"] === "string"
      ? req.headers["x-request-id"]
      : undefined;

    const assinaturaValida = validarAssinaturaMercadoPago(assinaturaHeader, requestIdHeader, id, segredoWebhook);
    if (!assinaturaValida) {
      res.sendStatus(401);
      return;
    }
  }

  try {
    const resp = await axios.get(
      `https://api.mercadopago.com/preapproval/${id}`,
      { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
    );

    // ✅ FIX: `snap` declarado antes de ser usado
    const snap = await db.collection('estabelecimentos')
      .where('mercadoPagoId', '==', id)
      .limit(1)
      .get();

    if (snap.empty) {
      console.warn(`Nenhum estabelecimento encontrado para mercadoPagoId: ${id}`);
      res.sendStatus(404);
      return;
    }

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