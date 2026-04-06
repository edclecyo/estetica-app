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

function signatureHeaderToMap(header: string): Record<string, string> {
  const map: Record<string, string> = {};
  header.split(",").forEach(part => {
    const [k, v] = part.split("=");
    if (k && v) map[k.trim()] = v.trim();
  });
  return map;
}

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
  await messaging.send({
    token,
    notification: { title, body },
    ...(data && { data })
  });
}
// Esta função fará o celular apitar sempre que um comunicado (ou qualquer notificação) for criado
export const aoCriarNotificacao = onDocumentCreated(
  { document: "notificacoes/{docId}", region: REGION },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    const adminId = data.adminId;

    // Busca o token do banco
    const token = await getTokenAdmin(adminId);

    if (token) {
      try {
        await enviarPush(
          token, 
          data.titulo || "Novidade no BeautyHub", 
          data.msg || data.mensagem || ""
        );
        console.log(`Push enviado para o admin: ${adminId}`);
      } catch (err) {
        console.error("Erro ao disparar push automático:", err);
      }
    }
  }
);
// 1. LEMBRETE OTIMIZADO (CORRIGIDO)
export const lembreteAgendamento = onSchedule(
  { region: REGION, schedule: "every 30 minutes" },
  async () => {
    const agora = admin.firestore.Timestamp.now();
    
    // 1. Busca apenas na coleção única 'agendamentos'
    // Filtramos quem deve ser notificado agora e ainda não foi.
    const snap = await db.collection('agendamentos')
      .where('notificado', '==', false)
      .where('notificarEm', '<=', agora)
      .where('status', '==', 'confirmado') // Opcional: apenas horários confirmados
      .limit(200)
      .get();

    if (snap.empty) {
      console.log("Subprocesso de lembretes: Nenhum agendamento para notificar.");
      return;
    }

    const batch = db.batch();
    const expiraNotificacao = new Date();
    expiraNotificacao.setDate(expiraNotificacao.getDate() + 30);

    // 2. Processamento dos agendamentos encontrados
    for (const doc of snap.docs) {
      const agend = doc.data();
      
      // Criar documento na coleção de notificações do usuário
      const notifRef = db.collection('notificacoes').doc();
      batch.set(notifRef, {
        clienteId: agend.clienteUid,
        titulo: '⏰ Horário chegando!',
        mensagem: `Lembrete: ${agend.servicoNome} às ${agend.horario}`,
        agendamentoId: doc.id,
        collection: 'agendamentos', // Agora é fixo
        lida: false,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        expiraEm: admin.firestore.Timestamp.fromDate(expiraNotificacao)
      });

      // Enviar o Push Notification (FCM)
      if (agend.fcmTokenCliente) {
        // Usamos try/catch aqui para que um erro de token não quebre o loop/batch
        try {
          await enviarPush(
            agend.fcmTokenCliente, 
            '⏰ Horário chegando!', 
            `Seu serviço de ${agend.servicoNome} está próximo.`
          );
        } catch (err) {
          console.error(`Erro ao enviar push para agendamento ${doc.id}:`, err);
        }
      }

      // Marcar como notificado para não enviar duplicado na próxima rodada
      batch.update(doc.ref, { notificado: true });
    }

    // 3. Commit de todas as operações
    await batch.commit();
    console.log(`✅ ${snap.size} lembretes processados com sucesso.`);
  }
);
// ─── 2. STATUS + RANKING JUNTO ─────────
export const onAgendamentoUpdate = onDocumentUpdated(
  { document: "agendamentos/{docId}", region: REGION },
  async (event) => {
    
    const antes = event.data?.before.data();
    const depois = event.data?.after.data();
    if (!antes || !depois) return;

    if (antes.status !== depois.status) {
      const titulo = depois.status === 'concluido' ? '✅ Atendimento Concluído!' : depois.status === 'cancelado' ? '❌ Agendamento Cancelado' : '';
      if (titulo) {
        if (depois.fcmTokenCliente) {
  await enviarPush(depois.fcmTokenCliente, titulo, `Serviço: ${depois.servicoNome}`);
}
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


// ─── 3. SALVAR/EDITAR ESTABELECIMENTO ─────────
export const salvarEstabelecimento = onCall({ region: REGION }, async (request) => {
	if (!request.auth) throw new HttpsError('unauthenticated', 'Acesso negado');
  
   const data = request.data || {};
   
  const clienteNome = String(data.clienteNome || "").trim().slice(0, 100);
  const docId = data.estabelecimentoId || db.collection('estabelecimentos').doc().id;
  const payload = { ...data, adminId: request.auth.uid, atualizadoEm: admin.firestore.FieldValue.serverTimestamp() };
  delete payload.estabelecimentoId;
  await db.collection('estabelecimentos').doc(docId).set(payload, { merge: true });
  return { id: docId, ok: true };
});

// ─── 4. CRIAR AGENDAMENTO OTIMIZADO ─────────
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
     const colecao = 'agendamentos';
    const [dia, mes, ano] = dataBr.split("/");
    const mesRef = `${ano}_${mes.padStart(2, "0")}`;

    if (clienteNome.length > 100) {
      throw new HttpsError('invalid-argument', 'Nome muito grande');
    }

    if (servicoNome.length > 100) {
      throw new HttpsError('invalid-argument', 'Serviço inválido');
    }

    if (!estabelecimentoId || !servicoNome || !clienteNome || !dataBr || !horario) {
      throw new HttpsError('invalid-argument', 'Campos obrigatórios ausentes');
    }

    const estSnap = await db.collection('estabelecimentos').doc(estabelecimentoId).get();

    if (!estSnap.exists) {
      throw new HttpsError('not-found', 'Estabelecimento não encontrado');
    }

    const est = estSnap.data() || {};
    const agora = new Date();
    const expiraEm = est.expiraEm?.toDate();

    // Validação de Plano (Substitui aquela verificação simples que você tinha)
    if (!est.assinaturaAtiva || (expiraEm && agora > expiraEm)) {
      throw new HttpsError(
        'failed-precondition', 
        'Este estabelecimento está com os agendamentos suspensos por falta de pagamento.'
      );
    }
    const servicos = Array.isArray(est.servicos) ? est.servicos : [];
    const servico = servicos.find((s: any) =>
      String(s?.nome || "").trim() === servicoNome
    );

    if (!servico) {
      throw new HttpsError('invalid-argument', 'Serviço inválido para este estabelecimento');
    }

    const dataHora = parseDataHoraBR(dataBr, horario);
    const notificarEmDate = new Date(dataHora.getTime() - (60 * 60 * 1000));
    const notificarEm = admin.firestore.Timestamp.fromDate(notificarEmDate);

    const fcmTokenCliente = await getTokenCliente(clienteUid);

    // 🔥 LOCKS
    const uniqueId = `${clienteUid}_${dataBr}_${horario}`;
    const lockRef = db.collection('agendamentoLocks').doc(uniqueId);

    const conflitoId = `${estabelecimentoId}_${dataBr}_${horario}`;
    const conflitoRef = db.collection('horariosOcupados').doc(conflitoId);

    // 🔥 RATE LIMIT (SEGURO COM TRANSACTION)
    const rateRef = db.collection('rateLimit').doc(clienteUid);

    await db.runTransaction(async (t) => {
      const snap = await t.get(rateRef);
      const agora = Date.now();

      if (snap.exists) {
        const dataLast = snap.data();
        const diff = agora - (dataLast?.timestamp || 0);

        if (diff < 5000) {
          throw new HttpsError('resource-exhausted', 'Muitas requisições');
        }
      }

      t.set(rateRef, { timestamp: agora });
    });

    // ⏳ expira em 2 dias
    const expira = new Date();
    expira.setDate(expira.getDate() + 2);

    let agendId = '';

    await db.runTransaction(async (t) => {

      // 🔥 LOCK USER
      const lockSnap = await t.get(lockRef);

      if (lockSnap.exists) {
        const lockData = lockSnap.data();
        const expiraEm = lockData?.expiraEm?.toDate?.();

        if (expiraEm && expiraEm > new Date()) {
          throw new HttpsError('already-exists', 'Você já tem um agendamento nesse horário');
        }
      }

      // 🔥 CONFLITO HORÁRIO
      const conflitoSnap = await t.get(conflitoRef);

      if (conflitoSnap.exists) {
        const conflitoData = conflitoSnap.data();
        const expiraEm = conflitoData?.expiraEm?.toDate?.();

        if (expiraEm && expiraEm > new Date()) {
          throw new HttpsError('already-exists', 'Horário já ocupado');
        }
      }

      // 🔒 CRIA LOCKS
      t.set(lockRef, {
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        expiraEm: admin.firestore.Timestamp.fromDate(expira)
      });

      t.set(conflitoRef, {
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        expiraEm: admin.firestore.Timestamp.fromDate(expira)
      });

      // 📌 CRIA AGENDAMENTO
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
export const limparLocks = onSchedule(
  { region: REGION, schedule: "every 24 hours" },
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

    console.log("🧹 Locks limpos com sucesso");
  }
);
// ─── 5. STATUS MANUAL ─────────
export const concluirAgendamento = onCall({ region: REGION }, async (request) => {
  // 1. Validação de Autenticação
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Acesso negado');
  }

  const { agendamentoId } = request.data;
  if (!agendamentoId) {
    throw new HttpsError('invalid-argument', 'O ID do agendamento é obrigatório');
  }

  try {
    const agendRef = db.collection('agendamentos').doc(agendamentoId);
    const snap = await agendRef.get();

    if (!snap.exists) {
      throw new HttpsError('not-found', 'Agendamento não encontrado');
    }

    const agendData = snap.data();
    
    // 2. Validação de Permissão: O admin logado é o dono deste agendamento?
    if (agendData?.adminId !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'Você não tem permissão para alterar este agendamento');
    }

    // 3. Validação de Plano: O estabelecimento está com a assinatura em dia?
    const estSnap = await db.collection('estabelecimentos').doc(agendData.estabelecimentoId).get();
    const estData = estSnap.data();
    
    if (!estData?.assinaturaAtiva) {
      throw new HttpsError(
        'failed-precondition', 
        'Sua assinatura expirou. Regularize o pagamento para gerir seus agendamentos.'
      );
    }

    // 4. Execução da atualização
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
// 🔥 LIMPEZA DE STORIES AUTOMÁTICA
export const limparStories = onSchedule({ schedule: "every 1 hours", region: REGION }, async () => {
  const agora = admin.firestore.Timestamp.now();
  const snap = await db.collection("stories").where("deletarEm", "<=", agora).limit(100).get();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.url) {
      const caminho = decodeURIComponent(data.url.split("/o/")[1]?.split("?")[0] || "");
      if (caminho) await getBucket().file(caminho).delete().catch(() => null);
    }
    await doc.ref.delete();
  }
});
// ─── 6. SCHEDULER ÚNICO (TUDO JUNTO) ─────────
export const manutencaoDiaria = onSchedule(
  { region: REGION, schedule: "every 24 hours" },
  async () => {
    const agora = admin.firestore.Timestamp.now();

    // ✅ Removida a parte de assinatura — já feita pela verificarAssinaturas
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
// ─── SCHEDULED JOBS (LIMPEZA/COBRANÇA) ───────────

export const verificarAssinaturas = onSchedule(
  { region: REGION, schedule: "every day 02:00" },
  async () => {

	 
  const agora = admin.firestore.Timestamp.now();
  const snap = await db.collection('estabelecimentos')
    .where('assinaturaAtiva', '==', true)
    .where('expiraEm', '<', agora).limit(500).get();

  const batch = db.batch();
  snap.docs.forEach(doc => batch.update(doc.ref, { 
    assinaturaAtiva: false, plano: 'free', statusPagamento: 'expirado' 
  }));
  await batch.commit();
});

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
      .where('expiraEm', '<=', limite).limit(500);

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
      clienteId: est.adminId,
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

if (snap.size < 500) break;
lastDoc = snap.docs[snap.size - 1];
}

});

export const criarAssinatura = onCall(
  { region: REGION },
  async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Acesso negado');
  }

  const { estabelecimentoId, email, plano } = request.data;

  if (!estabelecimentoId || !email || !plano) {
    throw new HttpsError('invalid-argument', 'Dados inválidos');
  }

  const planos: any = {
  essencial: 29.9,
  pro: 49.9,
  elite: 89.99,
};

  const valor = planos[plano];

  if (!valor) {
    throw new HttpsError('invalid-argument', 'Plano inválido');
  }

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
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        },
        timeout: 5000,
      }
    );

    const initPoint = resp.data?.init_point;
    const id = resp.data?.id;

    if (!initPoint || !id) {
      throw new HttpsError('internal', 'Erro ao criar pagamento');
    }

    // 🔗 Salva vínculo com estabelecimento
    await db.collection('estabelecimentos')
      .doc(estabelecimentoId)
      .update({
        mercadoPagoId: id,
        plano,
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

    return { url: initPoint };

  } catch (error: any) {
    console.error('Erro criar assinatura:', error?.response?.data || error.message);

    throw new HttpsError('internal', 'Erro ao gerar pagamento');
  }
});
// ─── 7. PLANOS E PAGAMENTOS ─────────
export const iniciarTrial = onCall(
  { region: REGION },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Acesso negado');
    
    const { estabelecimentoId } = req.data;
    if (!estabelecimentoId) {
      throw new HttpsError('invalid-argument', 'estabelecimentoId é obrigatório');
    }

    const estRef = db.collection('estabelecimentos').doc(estabelecimentoId);
    const estSnap = await estRef.get();

    if (!estSnap.exists) {
      throw new HttpsError('not-found', 'Estabelecimento não encontrado');
    }

    if (estSnap.data()?.adminId !== req.auth.uid) {
      throw new HttpsError('permission-denied', 'Você não pode iniciar trial deste estabelecimento');
    }

    const fim = new Date();
    fim.setDate(fim.getDate() + 14);

    // ✅ Adicione:
await estRef.update({
  plano: 'trial',
  assinaturaAtiva: true,
  expiraEm: fim,
  trialDataInicio: new Date(),
  trialUsado: true, // ← adicionar
});

    return { ok: true }; // Retorno importante para o front-end saber que deu certo
  } // Fecha a função async (req)
); // Fecha o onCall

// ─── 10. VERIFICAÇÃO AUTOMÁTICA ─────────
export const verificarSeloAutomatico = onSchedule(
    { region: REGION, schedule: "every 6 hours" }, // ← era "every 30 minutes"
    async () => {
  const snap = await db.collection('estabelecimentos')
    .where('plano', 'in', ['elite', 'pro'])
    .where('assinaturaAtiva', '==', true) // ← linha adicionada
    .get();

  const promessas = snap.docs.map(async (doc) => {
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
  });

  await Promise.all(promessas);
});

// ─── 11. SOLICITAR SELO (plano Pro) ─────────
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

  // ✅ Verifica critérios
  const totalAgends = (est.quantidadeAvaliacoes || 0);
  const negativas = (est.avaliacoesNegativas || 0);
  const plano = est.plano;

  if (plano !== 'pro') {
    throw new HttpsError('failed-precondition', 'Necessário plano Pro ou Elite');
  }
  if (totalAgends < 1000) {
    throw new HttpsError('failed-precondition', `Necessário 1000 atendimentos. Você tem ${totalAgends}.`);
  }
  if (negativas > 0) {
    throw new HttpsError('failed-precondition', 'Nenhuma avaliação negativa é permitida');
  }
  if (est.verificado) {
    throw new HttpsError('already-exists', 'Já possui o selo verificado');
  }
  if (est.solicitacaoSeloStatus === 'pendente') {
    throw new HttpsError('already-exists', 'Solicitação já em análise');
  }

  // ✅ Cria solicitação
  await db.collection('solicitacoesSelo').add({
    estabelecimentoId,
    estabelecimentoNome: est.nome,
    adminId,
    plano,
    totalAtendimentos: totalAgends,
    avaliacoesNegativas: negativas,
    avaliacao: est.avaliacao || 0,
    status: 'pendente',
    pagamentoNecessario: true, // R$ 14,90 para plano Pro
    valorTaxa: 14.90,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  // ✅ Atualiza status no estabelecimento
  await db.collection('estabelecimentos').doc(estabelecimentoId).update({
    solicitacaoSeloStatus: 'pendente',
    solicitacaoSeloEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  // ✅ Notifica Super Admins
  const superAdminsSnap = await db.collection('admins')
    .where('cargo', '==', 'Super Admin')
    .where('ativo', '==', true)
    .get();

  for (const superAdmin of superAdminsSnap.docs) {
    const expira = new Date();
expira.setDate(expira.getDate() + 30);

await db.collection('notificacoes').add({
  adminId: superAdmin.id,
  titulo: '🔔 Nova solicitação de selo',
  mensagem: `${est.nome} solicitou o selo verificado`,
  tipo: 'solicitacao_selo',
  estabelecimentoId,
  lida: false,
  apagada: false,
  criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  expiraEm: admin.firestore.Timestamp.fromDate(expira) // ✅ CORRETO
});

    const tokenSuperAdmin = await getTokenAdmin(superAdmin.id);
    if (tokenSuperAdmin) {
      await enviarPush(
        tokenSuperAdmin,
        '🔔 Nova solicitação de selo',
        `${est.nome} solicitou o selo verificado.`,
        { tela: 'dash' }
      );
    }
  }

  return { ok: true };
});

// ─── 12. APROVAR/REJEITAR SELO (Super Admin) ─────────
// ✅ Correto
export const responderSolicitacaoSelo = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Acesso negado');

  const { solicitacaoId, aprovado, motivo } = request.data;

  // ✅ Verifica se é Super Admin
  const adminSnap = await db.collection('admins').doc(request.auth.uid).get();
  if (adminSnap.data()?.cargo !== 'Super Admin') {
    throw new HttpsError('permission-denied', 'Apenas Super Admin pode aprovar selos');
  }

  const solSnap = await db.collection('solicitacoesSelo').doc(solicitacaoId).get();
  const sol = solSnap.data();
  if (!sol) throw new HttpsError('not-found', 'Solicitação não encontrada');

  const novoStatus = aprovado ? 'aprovado' : 'rejeitado';

  // ✅ Atualiza solicitação
  await db.collection('solicitacoesSelo').doc(solicitacaoId).update({
    status: novoStatus,
    motivo: motivo || '',
    respondidoEm: admin.firestore.FieldValue.serverTimestamp(),
    respondidoPor: request.auth.uid,
  });

  // ✅ Atualiza estabelecimento
  await db.collection('estabelecimentos').doc(sol.estabelecimentoId).update({
    verificado: aprovado,
    solicitacaoSeloStatus: novoStatus,
    verificadoEm: aprovado ? admin.firestore.FieldValue.serverTimestamp() : null,
    motivoVerificacao: aprovado ? 'Aprovado pelo Super Admin' : null,
  });

  // ✅ Notifica o admin do estabelecimento
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
  expiraEm: admin.firestore.Timestamp.fromDate(expira) // ✅ CORRETO
});

  const tokenAdmin = await getTokenAdmin(sol.adminId);
  if (tokenAdmin) {
    await enviarPush(tokenAdmin, titulo, mensagem, { tela: 'dash' });
  }

  return { ok: true };
});
export const webhookMercadoPago = onRequest(
  { region: REGION },
  async (req, res) => {
  const segredoWebhook = process.env.MP_WEBHOOK_SECRET;
  const tokenWebhook = process.env.MP_WEBHOOK_TOKEN;

  // 1. 🔒 Validação por token (Query Params)
  const tokenQuery = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;
  if (tokenWebhook && tokenQuery !== tokenWebhook) {
    res.sendStatus(401);
    return;
  }

  const action = req.body?.action;
const data = req.body?.data;

  // 2. 🚫 Ignora eventos que não interessam
  if (action !== "subscription.updated" || !data?.id) {
    res.sendStatus(200);
    return;
  }

  const id: string = data.id;

  // 3. 🔐 Validação de assinatura Mercado Pago (Opcional/Segurança Extra)
  if (segredoWebhook) {
    const assinaturaHeader = typeof req.headers["x-signature"] === "string"
      ? req.headers["x-signature"]
      : undefined;

    const requestIdHeader = typeof req.headers["x-request-id"] === "string"
      ? req.headers["x-request-id"]
      : undefined;

    const assinaturaValida = validarAssinaturaMercadoPago(
      assinaturaHeader,
      requestIdHeader,
      id,
      segredoWebhook
    );

    if (!assinaturaValida) {
      res.sendStatus(401);
      return;
    }
  }

  try {
    // 4. 📡 Consulta status real no Mercado Pago
    const resp = await axios.get<MercadoPagoPreapproval>(
      `https://api.mercadopago.com/preapproval/${id}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        },
        timeout: 5000,
      }
    );

    if (!resp.data || !resp.data.status) {
      console.error('Resposta inválida do Mercado Pago:', resp.data);
      res.sendStatus(500);
      return;
    }

    // 5. 🔍 Busca estabelecimento no Firestore
    const snap = await db.collection('estabelecimentos')
      .where('mercadoPagoId', '==', id)
      .limit(1)
      .get();

    if (snap.empty) {
      console.warn(`Nenhum estabelecimento encontrado para mercadoPagoId: ${id}`);
      res.sendStatus(404);
      return;
    }

    const docRef = snap.docs[0].ref;
    const dadosAtuais = snap.docs[0].data();

    // 🛠️ Ajuste do erro TS2339: Acessando last_modified com segurança
    const lastModifiedMP = (resp.data as any).last_modified;
    const novaDataMP = new Date(lastModifiedMP || Date.now());

    // 6. 🔁 Validação de concorrência (Evita webhooks antigos ou duplicados)
    if (dadosAtuais.ultimaAtualizacaoMP) {
      const dataLocal = dadosAtuais.ultimaAtualizacaoMP.toDate();
      if (dataLocal > novaDataMP) {
        console.log("Ignorando webhook antigo");
        res.sendStatus(200);
        return;
      }
    }

    if (dadosAtuais?.statusPagamento === resp.data.status) {
      console.log("Status idêntico ao atual, ignorando atualização.");
      res.sendStatus(200);
      return;
    }

    // 7. 💾 Log de pagamento
    const pgtosSnap = await db.collection('pagamentos')
      .where('mercadoPagoId', '==', id)
      .limit(1)
      .get();

    if (pgtosSnap.empty) {
      await db.collection('pagamentos').add({
        mercadoPagoId: id,
        status: resp.data.status,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
if (!['authorized', 'paused', 'cancelled', 'pending'].includes(resp.data.status)) {
  console.warn("Status desconhecido:", resp.data.status);
  res.sendStatus(200);
  return;
}
    // 8. 🔄 Atualização Final
    await docRef.update({
      assinaturaAtiva: resp.data.status === 'authorized',
      statusPagamento: resp.data.status,
      ultimaAtualizacaoMP: admin.firestore.Timestamp.fromDate(novaDataMP),
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.sendStatus(200);

  } catch (error: any) {
    console.error('Erro no Webhook Mercado Pago:', {
      message: error?.message,
      response: error?.response?.data,
    });
    res.sendStatus(500);
  }
});

export const cancelarAgendamento = onCall(
  { region: REGION },
  async (req) => {

  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Acesso negado');
  }

  const { agendamentoId } = req.data;

  if (!agendamentoId) {
    throw new HttpsError('invalid-argument', 'Dados inválidos');
  }

  const agendRef = db.collection('agendamentos').doc(agendamentoId);

  const snap = await agendRef.get();

  if (!snap.exists) {
    throw new HttpsError('not-found', 'Agendamento não encontrado');
  }

  const agend = snap.data();

  const isAdmin = agend?.adminId === req.auth.uid;
  const isCliente = agend?.clienteUid === req.auth.uid;

  if (!isAdmin && !isCliente) {
    throw new HttpsError('permission-denied', 'Sem permissão');
  }

  if (agend.status === 'concluido') {
    throw new HttpsError('failed-precondition', 'Não pode cancelar concluído');
  }

  if (agend.status === 'cancelado') {
    return { ok: true };
  }

  await agendRef.update({
    status: 'cancelado',
    canceladoEm: admin.firestore.FieldValue.serverTimestamp(),
    canceladoPor: req.auth.uid,
  });

  return { ok: true };
});
// ─── LIMPEZA DE DADOS (CLEANUP) ──────────────────

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

      snap.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      if (snap.size < 500) break;
    }

    console.log("🧹 Limpeza concluída");
  }
);