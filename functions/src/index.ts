import * as functions from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import axios from "axios";
import * as crypto from "crypto";

type MercadoPagoPreapproval = {
  id: string;
  status: 'authorized' | 'paused' | 'cancelled' | 'pending';
};
// Interface para corrigir os erros de tipagem do Axios no criarAssinatura
interface MercadoPagoResponse {
  init_point: string;
  id: string;
}
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
async function enviarPush(token: string, titulo: string, corpo: string, data?: any) {
  if (!token) return;

  await messaging.send({
    token,
    notification: {
      title: titulo,
      body: corpo,
    },
    ...(data && { data }),
  });
}

// ─── 1. LEMBRETE OTIMIZADO ─────────
export const lembreteAgendamento = onSchedule(
  { region: REGION, schedule: "every 15 minutes" }, // 🔥 melhor que 1h
  async () => {

    const MAX_LOOPS = 20;
    const LIMIT = 200;
    const MAX_PUSH = 100;

    let lastDoc = null;
    let loops = 0;

    while (true) {
      if (loops >= MAX_LOOPS) break;
      loops++;

      let query = db.collection('agendamentos')
        .where('notificarEm', '<=', admin.firestore.Timestamp.now())
        .where('notificado', '==', false)
        .limit(LIMIT);

      if (lastDoc) query = query.startAfter(lastDoc);

      const snap = await query.get();

      console.log(`📦 Loop ${loops} | Docs: ${snap.size}`);

      if (snap.empty) break;

      const batch = db.batch();
      const pushPromises: Promise<any>[] = [];

      for (const doc of snap.docs) {
        const agend = doc.data();

        const expira = new Date();
        expira.setDate(expira.getDate() + 30);

        // 🔔 salvar notificação
        const notifRef = db.collection('notificacoes').doc();
        batch.set(notifRef, {
  clienteId: agend.clienteUid,
  titulo: '⏰ Seu horário está chegando!',
  mensagem: `Lembrete: ${agend.servicoNome} às ${agend.horario}`,
  agendamentoId: doc.id, // Adicionado
  lida: false,
  criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  expiraEm: admin.firestore.Timestamp.fromDate(expira)
});

        // 📲 push
        if (agend.fcmTokenCliente) {
          pushPromises.push(
            messaging.send({
              token: agend.fcmTokenCliente,
              notification: {
                title: '⏰ Seu horário está chegando!',
                body: 'Confira seu agendamento no app'
              },
              data: { tela: 'agendamento' }
            })
          );
        }

        // 🔁 controle de lote de push
        if (pushPromises.length >= MAX_PUSH) {
          await Promise.allSettled(pushPromises);
          pushPromises.length = 0;
        }

        // ✅ marca como notificado
        batch.update(doc.ref, { notificado: true });
      }

      // 💾 salva tudo
      await batch.commit();

      // 🚀 envia restante dos push
      if (pushPromises.length) {
        await Promise.allSettled(pushPromises);
      }

      // ⛔ paginação
      if (snap.size < LIMIT) break;
      lastDoc = snap.docs[snap.size - 1];
    }

    console.log("✅ Lembretes finalizados");
  }
);
// ─── 2. STATUS + RANKING JUNTO ─────────
export const onAgendamentoUpdate = onDocumentUpdated(
  { document: "agendamentos/{docId}", region: REGION },
  async (event) => {
    const antes = event.data?.before.data();
    const depois = event.data?.after.data();

    if (!antes || !depois) return;

    // 🚀 EVITA EXECUÇÃO DESNECESSÁRIA
    if (
      antes.status === depois.status &&
      antes.avaliacaoCliente === depois.avaliacaoCliente
    ) return;

    // ─── PUSH STATUS (Notificações) ─────────
    if (antes.status !== depois.status) {
      let titulo = '';
      let corpo = '';

      if (depois.status === 'concluido') {
        titulo = '✅ Atendimento Concluído!';
        corpo = `Avalie o serviço de ${depois.servicoNome}`;
      } else if (depois.status === 'cancelado') {
        titulo = '❌ Agendamento Cancelado';
        corpo = `O serviço ${depois.servicoNome} foi cancelado.`;
      }

      if (titulo) {
  const expira = new Date();
  expira.setDate(expira.getDate() + 30);

  await db.collection('notificacoes').add({
    clienteId: depois.clienteUid,
    titulo,
    mensagem: corpo,
    lida: false,
    // --- ADICIONE ESTES CAMPOS ABAIXO ---
    agendamentoId: event.params.docId, // ID do agendamento para o botão avaliar
    estabelecimentoNome: depois.estabelecimentoNome, 
    tipo: 'status_agendamento',
    // ------------------------------------
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    expiraEm: admin.firestore.Timestamp.fromDate(expira)
  });

        if (depois.fcmTokenCliente) {
          await enviarPush(depois.fcmTokenCliente, titulo, corpo, { tela: 'agendamento' });
        }
      }
    }

    // ─── RANKING E PENALIDADES ─────────
    // Só entra aqui se o status for concluído E houver uma nova nota do cliente
    if (depois.status === 'concluido' && depois.avaliacaoCliente !== antes.avaliacaoCliente) {
      const estRef = db.collection('estabelecimentos').doc(depois.estabelecimentoId);

      await db.runTransaction(async (t) => {
        const estDoc = await t.get(estRef);
        if (!estDoc.exists) return;

        const d = estDoc.data() || {};

        // 1. Cálculos de Média
        const total = (d.quantidadeAvaliacoes || 0) + 1;
        const soma = (d.somaNotas || 0) + depois.avaliacaoCliente;
        let novaMedia = soma / total;

        // 2. Lógica de Negativas (Penalidade)
        // Se a nota for 1 ou 2, incrementamos o contador de negativas do estabelecimento
        let novasNegativas = d.avaliacoesNegativas || 0;
        if (depois.avaliacaoCliente <= 2) {
          novasNegativas += 1;
        }

        // A cada 10 avaliações negativas, subtraímos 0.5 da média visual (o "peso" da má fama)
        const penalidade = Math.floor(novasNegativas / 10) * 0.5;
        novaMedia = Math.max(1, novaMedia - penalidade); // Nota mínima é 1

        // 3. Cálculo do Ranking Score (Ajustado)
        // Damos peso para: Média, Quantidade de serviços e o Plano (Elite/Pro)
        const ranking =
          novaMedia * 2 +
          total * 0.5 +
          (d.plano === 'elite' ? 100 : d.plano === 'pro' ? 50 : 0);

        t.update(estRef, {
          avaliacao: Math.round(novaMedia * 10) / 10, // Arredonda para 1 casa decimal (ex: 4.7)
          quantidadeAvaliacoes: total,
          somaNotas: soma,
          avaliacoesNegativas: novasNegativas,
          rankingScore: ranking,
          ultimaAvaliacaoEm: admin.firestore.FieldValue.serverTimestamp()
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

  if (!data.nome) throw new functions.HttpsError('invalid-argument', 'Nome é obrigatório');

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
// ─── 4. CRIAR AGENDAMENTO OTIMIZADO ─────────
export const criarAgendamento = functions.onCall(async (request) => {

  if (!request.auth) throw new functions.HttpsError('unauthenticated', 'Acesso negado');

  const data = request.data || {};
  const clienteUid = request.auth.uid;

  const estabelecimentoId = String(data.estabelecimentoId || "");
  const servicoNome = String(data.servicoNome || "").trim();
  const clienteNome = String(data.clienteNome || "").trim();
  const dataBr = String(data.data || "").trim();
  const horario = String(data.horario || "").trim();

  if (clienteNome.length > 100) {
    throw new functions.HttpsError('invalid-argument', 'Nome muito grande');
  }

  if (servicoNome.length > 100) {
    throw new functions.HttpsError('invalid-argument', 'Serviço inválido');
  }

  if (!estabelecimentoId || !servicoNome || !clienteNome || !dataBr || !horario) {
    throw new functions.HttpsError('invalid-argument', 'Campos obrigatórios ausentes');
  }

  // 🚨 ANTI-SPAM CLIENTE
  const existe = await db.collection('agendamentos')
    .where('clienteUid', '==', clienteUid)
    .where('data', '==', dataBr)
    .where('horario', '==', horario)
    .limit(1)
    .get();

  if (!existe.empty) {
    throw new functions.HttpsError('already-exists', 'Você já tem um agendamento nesse horário');
  }

  // 🔍 Busca estabelecimento
  const estSnap = await db.collection('estabelecimentos').doc(estabelecimentoId).get();

  if (!estSnap.exists) {
    throw new functions.HttpsError('not-found', 'Estabelecimento não encontrado');
  }

  const est = estSnap.data() || {};

  // 🔒 Verifica assinatura
  if (!est.assinaturaAtiva) {
    throw new functions.HttpsError('failed-precondition', 'Sem assinatura');
  }

  // 🔍 Valida serviço
  const servicos = Array.isArray(est.servicos) ? est.servicos : [];
  const servico = servicos.find((s: any) =>
    String(s?.nome || "").trim() === servicoNome
  );

  if (!servico) {
    throw new functions.HttpsError('invalid-argument', 'Serviço inválido para este estabelecimento');
  }

  // 🔥 NOVO: evita conflito no estabelecimento (leve e seguro)
  const conflito = await db.collection('agendamentos')
    .where('estabelecimentoId', '==', estabelecimentoId)
    .where('data', '==', dataBr)
    .where('horario', '==', horario)
    .limit(1)
    .get();

  if (!conflito.empty) {
    throw new functions.HttpsError('already-exists', 'Horário já ocupado');
  }

  const dataHora = parseDataHoraBR(dataBr, horario);
  const notificarEmDate = new Date(dataHora.getTime() - (60 * 60 * 1000));

  const notificarEm = admin.firestore.Timestamp.fromDate(notificarEmDate);
  const fcmTokenCliente = await getTokenCliente(clienteUid);

  const agendRef = await db.collection('agendamentos').add({
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

const agora = admin.firestore.Timestamp.now();

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

export const cobrarAssinaturas = onSchedule("every day 09:00", async () => {
  const hoje = new Date();
  const em3dias = new Date();
  em3dias.setDate(hoje.getDate() + 3);
  const limite = admin.firestore.Timestamp.fromDate(em3dias);

 const MAX_LOOPS = 20;
let loops = 0;
let lastDoc = null; // 🔥 FALTAVA ISSO

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

export const criarAssinatura = 
functions.onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new functions.HttpsError('unauthenticated', 'Acesso negado');
  }

  const { estabelecimentoId, email, plano } = request.data;

  if (!estabelecimentoId || !email || !plano) {
    throw new functions.HttpsError('invalid-argument', 'Dados inválidos');
  }

  const planos: any = {
  essencial: 29.9,
  pro: 49.9,
  elite: 89.99,
};

  const valor = planos[plano];

  if (!valor) {
    throw new functions.HttpsError('invalid-argument', 'Plano inválido');
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
        back_url: "https://seuapp.com/sucesso",
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
      throw new functions.HttpsError('internal', 'Erro ao criar pagamento');
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

    throw new functions.HttpsError('internal', 'Erro ao gerar pagamento');
  }
});
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

// ─── 10. VERIFICAÇÃO AUTOMÁTICA ─────────
export const verificarSeloAutomatico = onSchedule("every 24 hours", async () => {
  const snap = await db.collection('estabelecimentos')
    .where('plano', 'in', ['elite', 'pro'])
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
export const solicitarSelo = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', 'Acesso negado');

  const { estabelecimentoId } = request.data;
  const adminId = request.auth.uid;

  const estSnap = await db.collection('estabelecimentos').doc(estabelecimentoId).get();
  const est = estSnap.data();

  if (!est) throw new functions.HttpsError('not-found', 'Estabelecimento não encontrado');
  if (est.adminId !== adminId) throw new functions.HttpsError('permission-denied', 'Sem permissão');

  // ✅ Verifica critérios
  const totalAgends = (est.quantidadeAvaliacoes || 0);
  const negativas = (est.avaliacoesNegativas || 0);
  const plano = est.plano;

  if (plano !== 'pro') {
    throw new functions.HttpsError('failed-precondition', 'Necessário plano Pro ou Elite');
  }
  if (totalAgends < 1000) {
    throw new functions.HttpsError('failed-precondition', `Necessário 1000 atendimentos. Você tem ${totalAgends}.`);
  }
  if (negativas > 0) {
    throw new functions.HttpsError('failed-precondition', 'Nenhuma avaliação negativa é permitida');
  }
  if (est.verificado) {
    throw new functions.HttpsError('already-exists', 'Já possui o selo verificado');
  }
  if (est.solicitacaoSeloStatus === 'pendente') {
    throw new functions.HttpsError('already-exists', 'Solicitação já em análise');
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
export const responderSolicitacaoSelo = functions.onCall(async (request) => {
  if (!request.auth) throw new functions.HttpsError('unauthenticated', 'Acesso negado');

  const { solicitacaoId, aprovado, motivo } = request.data;

  // ✅ Verifica se é Super Admin
  const adminSnap = await db.collection('admins').doc(request.auth.uid).get();
  if (adminSnap.data()?.cargo !== 'Super Admin') {
    throw new functions.HttpsError('permission-denied', 'Apenas Super Admin pode aprovar selos');
  }

  const solSnap = await db.collection('solicitacoesSelo').doc(solicitacaoId).get();
  const sol = solSnap.data();
  if (!sol) throw new functions.HttpsError('not-found', 'Solicitação não encontrada');

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
export const webhookMercadoPago = functions.onRequest(async (req, res) => {
  const segredoWebhook = process.env.MP_WEBHOOK_SECRET;
  const tokenWebhook = process.env.MP_WEBHOOK_TOKEN;

  // 1. 🔒 Validação por token (Query Params)
  const tokenQuery = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;
  if (tokenWebhook && tokenQuery !== tokenWebhook) {
    res.sendStatus(401);
    return;
  }

  const { action, data } = req.body;

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

export const cancelarAgendamento = functions.onCall(async (req) => {
  if (!req.auth) throw new functions.HttpsError('unauthenticated', 'Acesso negado');

  const { agendamentoId } = req.data;
  const agendRef = db.collection('agendamentos').doc(agendamentoId);
  const snap = await agendRef.get();

  if (!snap.exists) throw new functions.HttpsError('not-found', 'Não encontrado');
  if (snap.data()?.adminId !== req.auth.uid) throw new functions.HttpsError('permission-denied', 'Sem permissão');

  await agendRef.update({ status: 'cancelado' });
  return { ok: true };
});

// ─── LIMPEZA DE DADOS (CLEANUP) ──────────────────

export const limpezaHardDelete = onSchedule("every day 05:00", async () => {
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
}
});