import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentUpdated, onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import axios from "axios";
import * as crypto from "crypto";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

const REGION = "southamerica-east1";
const RATE_LIMIT_MS = 5000;

// --- INTERFACES ---
type MercadoPagoPreapproval = {
  id: string;
  status: 'authorized' | 'paused' | 'cancelled' | 'pending';
  last_modified?: string;
};

interface MercadoPagoResponse {
  init_point: string;
  id: string;
}

// --- HELPERS ---
function getBucket() {
  return admin.storage().bucket();
}

function parseDataHoraBR(data: string, horario: string): Date {
  const [d, m, a] = data.split("/").map(Number);
  const [h, min] = horario.split(":").map(Number);
  const date = new Date(a, m - 1, d, h, min);
  if (isNaN(date.getTime())) {
    throw new HttpsError("invalid-argument", "Data inválida");
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
  const parts = signatureHeaderToMap(assinaturaHeader);
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const manifesto = `id:${dataId};request-id:${requestIdHeader};ts:${ts};`;
  const assinaturaEsperada = crypto.createHmac("sha256", segredo).update(manifesto).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(assinaturaEsperada), Buffer.from(v1));
  } catch {
    return false;
  }
}

function signatureHeaderToMap(header?: string): Record<string, string> {
  const map: Record<string, string> = {};

  if (!header) return map;

  header.split(",").forEach(part => {
    const [k, v] = part.split("=");
    if (k && v) map[k.trim()] = v.trim();
  });

  return map;
}

// FIX CRÍTICO 3: getTokenAdmin mantida para uso direto, mas no solicitarSelo
// o token é lido do próprio documento da query (zero leituras extras).
async function getTokenCliente(uid: string) {
  const snap = await db.collection('clientes').doc(uid).get();
  return snap.data()?.fcmToken || null;
}

async function getTokenAdmin(uid: string) {
  const snap = await db.collection('admins').doc(uid).get();
  return snap.data()?.fcmToken || null;
}

async function enviarPush(token: string, title: string, body: string, data?: any) {
  if (!token) return;
  try {
    await messaging.send({
      token,
      notification: { title, body },
      ...(data && { data })
    });
  } catch (err) {
    console.error("Erro ao enviar push:", err);
  }
}

// ─── TRIGGER: CRIAR NOTIFICAÇÃO ───────────────────────────────────────────────
// FIX CRÍTICO 1: O trigger agora distingue entre notificações de admin e de cliente.
// Se o documento tiver 'adminId', dispara para admin. Se tiver 'clienteId' sem 'adminId',
// dispara para cliente. Isso evita leituras desperdiçadas em tokens errados.
export const aoCriarNotificacao = onDocumentCreated(
  { document: "notificacoes/{docId}", region: REGION },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();

    // Notificação destinada a um admin
    if (data.adminId) {
      const token = await getTokenAdmin(data.adminId);
      if (token) {
        try {
          await enviarPush(
            token,
            data.titulo || "Novidade no BeautyHub",
            data.msg || data.mensagem || ""
          );
          console.log(`Push enviado para o admin: ${data.adminId}`);
        } catch (err) {
          console.error("Erro ao disparar push automático para admin:", err);
        }
      }
      return;
    }

    // Notificação destinada a um cliente
    if (data.clienteId) {
      const token = await getTokenCliente(data.clienteId);
      if (token) {
        try {
          await enviarPush(
            token,
            data.titulo || "Novidade no BeautyHub",
            data.msg || data.mensagem || ""
          );
          console.log(`Push enviado para o cliente: ${data.clienteId}`);
        } catch (err) {
          console.error("Erro ao disparar push automático para cliente:", err);
        }
      }
    }
  }
);

// ─── 1. LEMBRETE DE AGENDAMENTO ───────────────────────────────────────────────
// AVISO: Requer índice composto no Firestore:
// Coleção: agendamentos | Campos: status ASC, notificado ASC, notificarEm ASC
export const lembreteAgendamento = onSchedule(
  { region: REGION, schedule: "every 60 minutes" },
  async () => {
    const agora = admin.firestore.Timestamp.now();

    const snap = await db.collection('agendamentos')
      .where('notificado', '==', false)
      .where('notificarEm', '<=', agora)
      .where('status', '==', 'confirmado')
      .limit(200)
      .get();

    if (snap.empty) {
      console.log("Subprocesso de lembretes: Nenhum agendamento para notificar.");
      return;
    }

    const batch = db.batch();
    const promises: Promise<any>[] = [];
    const expiraNotificacao = new Date();
    expiraNotificacao.setDate(expiraNotificacao.getDate() + 30);

    for (const doc of snap.docs) {
      const agend = doc.data();
      const notifRef = db.collection('notificacoes').doc();

      batch.set(notifRef, {
        clienteId: agend.clienteUid,
        titulo: '⏰ Horário chegando!',
        mensagem: `Lembrete: ${agend.servicoNome} às ${agend.horario}`,
        agendamentoId: doc.id,
        collection: 'agendamentos',
        lida: false,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        expiraEm: admin.firestore.Timestamp.fromDate(expiraNotificacao)
      });

      batch.update(doc.ref, { notificado: true });

      if (agend.fcmTokenCliente) {
        promises.push(
          enviarPush(
            agend.fcmTokenCliente,
            '⏰ Horário chegando!',
            `${agend.servicoNome} às ${agend.horario}`
          )
        );
      }
    }

    await batch.commit();
    await Promise.allSettled(promises);

    console.log(`✅ ${snap.size} lembretes processados.`);
  }
);

// ─── 2. STATUS + RANKING ──────────────────────────────────────────────────────
export const onAgendamentoUpdate = onDocumentUpdated(
  { document: "agendamentos/{docId}", region: REGION },
  async (event) => {
    const antes = event.data?.before.data();
    const depois = event.data?.after.data();
    if (!antes || !depois) return;

    if (antes.status !== depois.status) {
      const titulo =
        depois.status === 'concluido' ? '✅ Atendimento Concluído!' :
        depois.status === 'cancelado' ? '❌ Agendamento Cancelado' : '';

      if (titulo && depois.fcmTokenCliente) {
        await enviarPush(depois.fcmTokenCliente, titulo, `Serviço: ${depois.servicoNome}`);
      }
    }

    if (depois.status === 'concluido' && depois.avaliacaoCliente !== antes.avaliacaoCliente) {
      const estRef = db.collection('estabelecimentos').doc(depois.estabelecimentoId);
      await db.runTransaction(async (t) => {
        const estDoc = await t.get(estRef);
        if (!estDoc.exists) return;
        const d = estDoc.data() || {};
        const total = (d.quantidadeAvaliacoes || 0) + 1;
        const soma = (d.somaNotas || 0) + depois.avaliacaoCliente;
        const novaMedia = soma / total;
        t.update(estRef, {
          avaliacao: Math.round(novaMedia * 10) / 10,
          quantidadeAvaliacoes: total,
          somaNotas: soma,
          rankingScore: novaMedia * 2 + total * 0.5
        });
      });
    }
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

  // 🚫 BLOQUEIO FREE (SEM QUEBRAR APP)
  if (isNovo && totalEstabs >= 1) {
    return {
      ok: false,
      code: 'LIMITO_FREE',
      message: 'Você já possui um estabelecimento no plano gratuito.'
    };
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
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
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

    const [dia, mes, ano] = dataBr.split("/");
    const mesRef = `${ano}_${mes.padStart(2, "0")}`;

    if (clienteNome.length > 100) throw new HttpsError('invalid-argument', 'Nome muito grande');
    if (servicoNome.length > 100) throw new HttpsError('invalid-argument', 'Serviço inválido');
    if (!estabelecimentoId || !servicoNome || !clienteNome || !dataBr || !horario) {
      throw new HttpsError('invalid-argument', 'Campos obrigatórios ausentes');
    }

    const estSnap = await db.collection('estabelecimentos').doc(estabelecimentoId).get();
    if (!estSnap.exists) throw new HttpsError('not-found', 'Estabelecimento não encontrado');

    const est = estSnap.data() || {};
    const agora = new Date();
    const expiraEm = est.expiraEm?.toDate();

    if (!est.assinaturaAtiva || (expiraEm && agora > expiraEm)) {
      throw new HttpsError('failed-precondition', 'Este estabelecimento está com os agendamentos suspensos por falta de pagamento.');
    }

    const servicos = Array.isArray(est.servicos) ? est.servicos : [];
    const servico = servicos.find((s: any) => String(s?.nome || "").trim() === servicoNome);
    if (!servico) throw new HttpsError('invalid-argument', 'Serviço inválido para este estabelecimento');

    const dataHora = parseDataHoraBR(dataBr, horario);
    const notificarEmDate = new Date(dataHora.getTime() - (60 * 60 * 1000));
    const notificarEm = admin.firestore.Timestamp.fromDate(notificarEmDate);

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
        const diff = now - (snap.data()?.timestamp || 0);
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
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { id: agendId };
  }
);

// ─── LIMPAR LOCKS ─────────────────────────────────────────────────────────────
// FIX AVISO: horário fixo para não colidir com outros schedulers
export const limparLocks = onSchedule(
  { region: REGION, schedule: "every day 04:00" },
  async () => {
    const agora = admin.firestore.Timestamp.now();
    const MAX_LOOPS = 20;
    const colecoes = ['agendamentoLocks', 'horariosOcupados'];

    for (const nome of colecoes) {
      let loops = 0;
      while (true) {
        if (loops++ >= MAX_LOOPS) break;
        const snap = await db.collection(nome)
          .where('expiraEm', '<=', agora)
          .limit(500)
          .get();
        if (snap.empty) break;
        const batch = db.batch();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        if (snap.size < 500) break;
      }
    }

    // FIX AVISO: limpa também rateLimit com mais de 24h para evitar crescimento ilimitado
    const ontemMs = Date.now() - (24 * 60 * 60 * 1000);
    let loops = 0;
    const MAX_LOOPS_RL = 10;
    while (true) {
      if (loops++ >= MAX_LOOPS_RL) break;
      const snap = await db.collection('rateLimit')
        .where('timestamp', '<', ontemMs)
        .limit(500)
        .get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      if (snap.size < 500) break;
    }

    console.log("🧹 Locks e rateLimit limpos com sucesso");
  }
);

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

// ─── LIMPAR STORIES ───────────────────────────────────────────────────────────
export const limparStories = onSchedule(
  { schedule: "every 1 hours", region: REGION },
  async () => {
    const agora = admin.firestore.Timestamp.now();
    const snap = await db.collection("stories")
      .where("deletarEm", "<=", agora)
      .limit(100)
      .get();

    if (snap.empty) return;

    const batch = db.batch();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.url) {
        const caminho = decodeURIComponent(
          data.url.split("/o/")[1]?.split("?")[0] || ""
        );
        if (caminho) {
          await getBucket().file(caminho).delete().catch(() => null);
        }
      }
      batch.delete(doc.ref);
    }

    await batch.commit();
    console.log("🧹 Stories limpos");
  }
);

// ─── 6. MANUTENÇÃO DIÁRIA ─────────────────────────────────────────────────────
// FIX AVISO: horário fixo para não colidir com outros schedulers
export const manutencaoDiaria = onSchedule(
  { region: REGION, schedule: "every day 03:00" },
  async () => {
    const agora = admin.firestore.Timestamp.now();

    const dest = await db.collection('estabelecimentos')
      .where('destaqueExpira', '<=', agora)
      .get();

    const batch = db.batch();
    dest.docs.forEach(d => batch.update(d.ref, { destaqueAtivo: false }));

    try {
      await batch.commit();
    } catch (e) {
      console.error('Erro no batch da manutenção diária:', e);
      throw e;
    }
  }
);

// ─── VERIFICAR ASSINATURAS ────────────────────────────────────────────────────
export const verificarAssinaturas = onSchedule(
  { region: REGION, schedule: "every day 02:00" },
  async () => {
    const agora = admin.firestore.Timestamp.now();

    const MAX_LOOPS = 20;
    let loops = 0;
    let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;

    let totalAtualizados = 0;

    while (true) {
      if (loops++ >= MAX_LOOPS) break;

      let query = db.collection('estabelecimentos')
        .where('assinaturaAtiva', '==', true)
        .where('expiraEm', '<', agora)
        .limit(500);

      if (lastDoc) query = query.startAfter(lastDoc);

      const snap = await query.get();
      if (snap.empty) break;

      const batch = db.batch();

      snap.docs.forEach(doc => {
        const data = doc.data();

        const updates: any = {
          assinaturaAtiva: false,
          statusPagamento: 'expirado',
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        };

        // 🔥 TRIAL → vira FREE automaticamente
        if (data.plano === 'trial') {
          updates.plano = 'free';
          updates.trialExpiradoEm = admin.firestore.FieldValue.serverTimestamp();
        }

        // 🔥 Planos pagos → mantém plano, mas desativa acesso
        if (['essencial', 'pro', 'elite'].includes(data.plano)) {
          updates.statusPagamento = 'pendente';
        }

        batch.update(doc.ref, updates);
      });

      await batch.commit();
      totalAtualizados += snap.size;

      if (snap.size < 500) break;
      lastDoc = snap.docs[snap.size - 1];
    }

    console.log(`✅ verificarAssinaturas finalizado | Atualizados: ${totalAtualizados}`);
  }
);

// ─── COBRAR ASSINATURAS ───────────────────────────────────────────────────────
export const cobrarAssinaturas = onSchedule(
  { region: REGION, schedule: "every day 09:00" },
  async () => {
    const hoje = new Date();
    const em3dias = new Date();
    em3dias.setDate(hoje.getDate() + 3);
    const limite = admin.firestore.Timestamp.fromDate(em3dias);

    const MAX_LOOPS = 20;
    let loops = 0;
    let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;

    while (true) {
      if (loops >= MAX_LOOPS) break;
      loops++;

      let query = db.collection('estabelecimentos')
        .where('assinaturaAtiva', '==', true)
        .where('expiraEm', '<=', limite)
        .limit(500);

      if (lastDoc) query = query.startAfter(lastDoc);
      const snap = await query.get();
      if (snap.empty) break;

      const batch = db.batch();

      for (const doc of snap.docs) {
        const est = doc.data();
        const expiraData = est.expiraEm?.toDate?.();
        if (!expiraData) continue;

        const diff = Math.ceil((expiraData.getTime() - hoje.getTime()) / 86400000);

        if (diff === 3 && !est.notificado3dias) {
          const expira = new Date();
          expira.setDate(expira.getDate() + 30);
          const notifRef = db.collection('notificacoes').doc();
          batch.set(notifRef, {
            adminId: est.adminId, // FIX: campo correto para o trigger aoCriarNotificacao rotear para admin
            titulo: "Plano vencendo",
            mensagem: "Seu plano vence em 3 dias",
            tipo: "cobranca",
            lida: false,
            criadoEm: admin.firestore.FieldValue.serverTimestamp(),
            expiraEm: admin.firestore.Timestamp.fromDate(expira)
          });
          batch.update(doc.ref, { notificado3dias: true });

        } else if (diff < 0) {
          batch.update(doc.ref, {
            assinaturaAtiva: false,
            statusPagamento: 'pendente'
          });
        }
      }

      await batch.commit();

      // FIX CRÍTICO 2 (já estava correto na versão enviada, mantido):
      // lastDoc atualizado após o break condicional — paginação correta.
      if (snap.size < 500) break;
      lastDoc = snap.docs[snap.size - 1];
    }
  }
);

// ─── CRIAR ASSINATURA ─────────────────────────────────────────────────────────
export const criarAssinatura = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

    const { estabelecimentoId, email, plano } = request.data;
    if (!estabelecimentoId || !email || !plano) throw new HttpsError('invalid-argument', 'Dados inválidos');

    const planos: Record<string, number> = {
      essencial: 29.9,
      pro: 49.9,
      elite: 89.99,
    };

    const valor = planos[plano];
    if (!valor) throw new HttpsError('invalid-argument', 'Plano inválido');

    try {
      const resp = await axios.post<MercadoPagoResponse>(
        'https://api.mercadopago.com/preapproval',
        {
          reason: `Plano ${plano}`,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: valor,
            currency_id: "BRL",
          },
          back_url: process.env.MP_BACK_URL || "https://seuapp.com/sucesso",
          payer_email: email,
        },
        {
          headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
          timeout: 5000,
        }
      );

      const initPoint = resp.data?.init_point;
      const id = resp.data?.id;
      if (!initPoint || !id) throw new HttpsError('internal', 'Erro ao criar pagamento');

      await db.collection('estabelecimentos').doc(estabelecimentoId).update({
        mercadoPagoId: id,
        plano,
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { url: initPoint };

    } catch (error: any) {
      console.error('Erro criar assinatura:', error?.response?.data || error.message);
      throw new HttpsError('internal', 'Erro ao gerar pagamento');
    }
  }
);

// ─── 7. INICIAR TRIAL ─────────────────────────────────────────────────────────
// ALTERADO: trial → 7 dias
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
      trialInicio: admin.firestore.Timestamp.fromDate(agora),
      expiraEm: admin.firestore.Timestamp.fromDate(expira),
    });

    return { ok: true };
  }
);

// ─── 10. VERIFICAÇÃO DE SELO AUTOMÁTICA ───────────────────────────────────────
// FIX AVISO: Promise.all em chunks de 20 para não estourar cota de escritas Firestore
export const verificarSeloAutomatico = onSchedule(
  { region: REGION, schedule: "every 6 hours" },
  async () => {
    const snap = await db.collection('estabelecimentos')
      .where('plano', 'in', ['elite', 'pro'])
      .where('assinaturaAtiva', '==', true)
      .get();

    const CHUNK_SIZE = 20;
    for (let i = 0; i < snap.docs.length; i += CHUNK_SIZE) {
      const chunk = snap.docs.slice(i, i + CHUNK_SIZE);
      await Promise.allSettled(chunk.map(async (doc) => {
        const e = doc.data();

        if (e.plano === 'elite' && e.assinaturaAtiva) {
          if (!e.verificado) {
            await doc.ref.update({
              verificado: true,
              verificadoAutomatico: true,
              verificadoEm: admin.firestore.FieldValue.serverTimestamp(),
              motivoVerificacao: 'Plano Elite — verificação automática',
            });
          }
          return;
        }

        if (e.verificado && e.verificadoAutomatico) {
          const perdeuCriterios =
            !e.assinaturaAtiva ||
            (e.plano !== 'elite' && e.plano !== 'pro') ||
            (e.avaliacoesNegativas || 0) >= 10;

          if (perdeuCriterios) {
            await doc.ref.update({
              verificado: false,
              verificadoAutomatico: false,
              motivoRemocaoSelo: 'Critérios não atendidos',
              seloRemovidoEm: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }
      }));
    }
  }
);

// ─── 11. SOLICITAR SELO (plano Pro) ───────────────────────────────────────────
export const solicitarSelo = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

    const { estabelecimentoId } = request.data;
    const adminId = request.auth.uid;

    const estSnap = await db.collection('estabelecimentos').doc(estabelecimentoId).get();
    const est = estSnap.data();
    if (!est) throw new HttpsError('not-found', 'Estabelecimento não encontrado');
    if (est.adminId !== adminId) throw new HttpsError('permission-denied', 'Sem permissão');

    const totalAgends = (est.quantidadeAvaliacoes || 0);
    const negativas = (est.avaliacoesNegativas || 0);
    const plano = est.plano;

    if (plano !== 'pro') throw new HttpsError('failed-precondition', 'Necessário plano Pro ou Elite');
    if (totalAgends < 1000) throw new HttpsError('failed-precondition', `Necessário 1000 atendimentos. Você tem ${totalAgends}.`);
    if (negativas > 0) throw new HttpsError('failed-precondition', 'Nenhuma avaliação negativa é permitida');
    if (est.verificado) throw new HttpsError('already-exists', 'Já possui o selo verificado');
    if (est.solicitacaoSeloStatus === 'pendente') throw new HttpsError('already-exists', 'Solicitação já em análise');

    await db.collection('solicitacoesSelo').add({
      estabelecimentoId,
      estabelecimentoNome: est.nome,
      adminId,
      plano,
      totalAtendimentos: totalAgends,
      avaliacoesNegativas: negativas,
      avaliacao: est.avaliacao || 0,
      status: 'pendente',
      pagamentoNecessario: true,
      valorTaxa: 14.90,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('estabelecimentos').doc(estabelecimentoId).update({
      solicitacaoSeloStatus: 'pendente',
      solicitacaoSeloEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    // FIX CRÍTICO 3: token lido direto do documento da query — zero leituras extras
    const superAdminsSnap = await db.collection('admins')
      .where('cargo', '==', 'Super Admin')
      .where('ativo', '==', true)
      .get();

    const expira = new Date();
    expira.setDate(expira.getDate() + 30);

    const notifBatch = db.batch();
    const pushPromises: Promise<any>[] = [];

    for (const superAdmin of superAdminsSnap.docs) {
      const notifRef = db.collection('notificacoes').doc();
      notifBatch.set(notifRef, {
        adminId: superAdmin.id,
        titulo: '🔔 Nova solicitação de selo',
        mensagem: `${est.nome} solicitou o selo verificado`,
        tipo: 'solicitacao_selo',
        estabelecimentoId,
        lida: false,
        apagada: false,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        expiraEm: admin.firestore.Timestamp.fromDate(expira)
      });

      // Token lido direto do documento — sem getTokenAdmin() em loop
      const tokenSuperAdmin = superAdmin.data().fcmToken || null;
      if (tokenSuperAdmin) {
        pushPromises.push(
          enviarPush(tokenSuperAdmin, '🔔 Nova solicitação de selo', `${est.nome} solicitou o selo verificado.`, { tela: 'dash' })
        );
      }
    }

    await notifBatch.commit();
    await Promise.allSettled(pushPromises);

    return { ok: true };
  }
);

// ─── 12. APROVAR/REJEITAR SELO (Super Admin) ──────────────────────────────────
export const responderSolicitacaoSelo = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

  const { solicitacaoId, aprovado, motivo } = request.data;

  const adminSnap = await db.collection('admins').doc(request.auth.uid).get();
  if (adminSnap.data()?.cargo !== 'Super Admin') {
    throw new HttpsError('permission-denied', 'Apenas Super Admin pode aprovar selos');
  }

  const solSnap = await db.collection('solicitacoesSelo').doc(solicitacaoId).get();
  const sol = solSnap.data();
  if (!sol) throw new HttpsError('not-found', 'Solicitação não encontrada');

  const novoStatus = aprovado ? 'aprovado' : 'rejeitado';

  await db.collection('solicitacoesSelo').doc(solicitacaoId).update({
    status: novoStatus,
    motivo: motivo || '',
    respondidoEm: admin.firestore.FieldValue.serverTimestamp(),
    respondidoPor: request.auth.uid,
  });

  await db.collection('estabelecimentos').doc(sol.estabelecimentoId).update({
    verificado: aprovado,
    solicitacaoSeloStatus: novoStatus,
    verificadoEm: aprovado ? admin.firestore.FieldValue.serverTimestamp() : null,
    motivoVerificacao: aprovado ? 'Aprovado pelo Super Admin' : null,
  });

  const titulo = aprovado ? '✅ Selo Verificado Aprovado!' : '❌ Solicitação de Selo Rejeitada';
  const mensagem = aprovado
    ? `Parabéns! ${sol.estabelecimentoNome} agora tem o selo verificado ✅`
    : `Sua solicitação foi rejeitada. ${motivo ? `Motivo: ${motivo}` : ''}`;

  const expira = new Date();
  expira.setDate(expira.getDate() + 30);

  await db.collection('notificacoes').add({
    adminId: sol.adminId,
    titulo,
    mensagem,
    tipo: 'resposta_selo',
    lida: false,
    apagada: false,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    expiraEm: admin.firestore.Timestamp.fromDate(expira)
  });

  const tokenAdmin = await getTokenAdmin(sol.adminId);
  if (tokenAdmin) {
    await enviarPush(tokenAdmin, titulo, mensagem, { tela: 'dash' });
  }

  return { ok: true };
});

// ─── WEBHOOK MERCADO PAGO ─────────────────────────────────────────────────────
export const webhookMercadoPago = onRequest(
  { region: REGION },
  async (req, res) => {
    try {
      const segredoWebhook = process.env.MP_WEBHOOK_SECRET;
      const tokenWebhook = process.env.MP_WEBHOOK_TOKEN;

      // ✅ 1. VALIDA TOKEN DA URL (primeira barreira)
      const tokenQuery = Array.isArray(req.query.token)
        ? req.query.token[0]
        : req.query.token;

      if (tokenWebhook && tokenQuery !== tokenWebhook) {
        console.warn("❌ Token inválido");
        res.sendStatus(401);
        return;
      }

      const action = req.body?.action;
      const data = req.body?.data;

      // ✅ 2. FILTRA EVENTOS
      if (!data?.id) {
        res.sendStatus(200);
        return;
      }

      const id: string = data.id;

      // 🔒 3. VALIDA ASSINATURA HMAC (anti-fraude forte)
      if (segredoWebhook) {
        const assinaturaHeader =
          typeof req.headers["x-signature"] === "string"
            ? req.headers["x-signature"]
            : undefined;

        const requestIdHeader =
          typeof req.headers["x-request-id"] === "string"
            ? req.headers["x-request-id"]
            : undefined;

        const assinaturaValida = validarAssinaturaMercadoPago(
          assinaturaHeader,
          requestIdHeader,
          id,
          segredoWebhook
        );

        if (!assinaturaValida) {
          console.warn("❌ Assinatura inválida");
          res.sendStatus(401);
          return;
        }
      }

      // ⚡ 4. BUSCA STATUS REAL NO MP (NUNCA confia no webhook)
      const resp = await axios.get<MercadoPagoPreapproval>(
        `https://api.mercadopago.com/preapproval/${id}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          },
          timeout: 8000,
        }
      );

      const mpData = resp.data;

      if (!mpData?.status) {
        console.error("❌ Resposta inválida MP");
        res.sendStatus(500);
        return;
      }

      // 🔎 5. BUSCA ESTABELECIMENTO
      const snap = await db.collection("estabelecimentos")
        .where("mercadoPagoId", "==", id)
        .limit(1)
        .get();

      if (snap.empty) {
        console.warn("⚠️ Nenhum estabelecimento encontrado");
        res.sendStatus(404);
        return;
      }

      const docRef = snap.docs[0].ref;
      const dados = snap.docs[0].data();

      // 🧠 6. PROTEÇÃO CONTRA REPLAY (webhook duplicado)
      const lastModifiedMP = (mpData as any).last_modified;
      const novaDataMP = new Date(lastModifiedMP || Date.now());

      if (dados.ultimaAtualizacaoMP) {
        const dataLocal = dados.ultimaAtualizacaoMP.toDate();

        if (dataLocal >= novaDataMP) {
          console.log("⏭️ Webhook antigo ignorado");
          res.sendStatus(200);
          return;
        }
      }

      // 💰 7. LOG DE PAGAMENTO (anti duplicação)
      const pagamentoExistente = await db.collection("pagamentos")
        .where("mercadoPagoId", "==", id)
        .limit(1)
        .get();

      if (pagamentoExistente.empty) {
        await db.collection("pagamentos").add({
          mercadoPagoId: id,
          status: mpData.status,
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // 🎯 8. ATUALIZA STATUS
      const agora = new Date();

let novaExpiracao: Date | null = null;
let assinaturaAtiva = false;
let statusPagamento = mpData.status;

// ✅ PAGAMENTO APROVADO / AUTORIZADO
if (mpData.status === "authorized") {
  assinaturaAtiva = true;

  const expiraAtual = dados.expiraEm?.toDate?.();

  // 🔁 Se ainda não venceu → soma +30 dias
  if (expiraAtual && expiraAtual > agora) {
    novaExpiracao = new Date(expiraAtual);
    novaExpiracao.setDate(novaExpiracao.getDate() + 30);
  } else {
    // 🆕 Novo ciclo
    novaExpiracao = new Date();
    novaExpiracao.setDate(novaExpiracao.getDate() + 30);
  }
}

// ❌ CANCELADO OU PAUSADO
if (mpData.status === "cancelled" || mpData.status === "paused") {
  assinaturaAtiva = false;
}

await docRef.update({
  assinaturaAtiva,
  statusPagamento,
  ...(novaExpiracao && {
    expiraEm: admin.firestore.Timestamp.fromDate(novaExpiracao)
  }),
  ultimaAtualizacaoMP: admin.firestore.Timestamp.fromDate(new Date()),
  atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
});
// 🔔 Notificação de pagamento aprovado
if (mpData.status === "authorized" && dados.statusPagamento !== "authorized") {
  await db.collection('notificacoes').add({
    adminId: dados.adminId,
    titulo: "💰 Pagamento confirmado",
    mensagem: "Seu plano foi renovado com sucesso!",
    tipo: "pagamento",
    lida: false,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });
}
      console.log("✅ Webhook processado:", mpData.status);

      res.sendStatus(200);

    } catch (error: any) {
      console.error("🔥 ERRO WEBHOOK:", {
        message: error?.message,
        response: error?.response?.data,
      });

      res.sendStatus(500);
    }
  }
);
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

// ─── LIMPEZA HARD DELETE ──────────────────────────────────────────────────────
export const limpezaHardDelete = onSchedule(
  { region: REGION, schedule: "every day 05:00" },
  async () => {
    const limite = new Date();
    limite.setDate(limite.getDate() - 90);

    let loops = 0;
    const MAX_LOOPS = 20;

    while (true) {
      if (loops++ >= MAX_LOOPS) break;

      const snap = await db.collection('agendamentos')
        .where('deletado', '==', true)
        .where('deletadoEm', '<', limite)
        .limit(500)
        .get();

      if (snap.empty) break;

      const batch = db.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();

      if (snap.size < 500) break;
    }

    console.log("🧹 Limpeza concluída");
  }
);