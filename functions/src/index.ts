import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

async function verificarAdmin(uid: string): Promise<boolean> {
  const snap = await db.doc(`admins/${uid}`).get();
  return snap.exists && snap.data()?.ativo === true;
}

export const criarAgendamento = onCall(async (request) => {
  const data = request.data;
  const campos = ["estabelecimentoId","servicoNome","clienteNome","data","horario"];
  for (const campo of campos) {
    if (!data[campo]) {
      throw new HttpsError("invalid-argument", `Campo obrigatório: ${campo}`);
    }
  }
  const conflito = await db.collection("agendamentos")
    .where("estabelecimentoId", "==", data.estabelecimentoId)
    .where("data", "==", data.data)
    .where("horario", "==", data.horario)
    .where("status", "in", ["confirmado", "pendente"])
    .get();

  if (!conflito.empty) {
    throw new HttpsError("already-exists", "Horário já ocupado.");
  }
  const ref = await db.collection("agendamentos").add({
    ...data,
    status: "confirmado",
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
});

export const cancelarAgendamento = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Não autenticado.");
  }
  if (!await verificarAdmin(request.auth.uid)) {
    throw new HttpsError("permission-denied", "Sem permissão.");
  }
  await db.doc(`agendamentos/${request.data.agendamentoId}`).update({
    status: "cancelado",
  });
  return { mensagem: "Cancelado com sucesso." };
});

export const salvarEstabelecimento = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Não autenticado.");
  }
  if (!await verificarAdmin(request.auth.uid)) {
    throw new HttpsError("permission-denied", "Sem permissão.");
  }
  const data = request.data;
  const payload: any = {
    ...data,
    adminId: request.auth.uid,
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (data.id) {
    await db.doc(`estabelecimentos/${data.id}`).update(payload);
    return { id: data.id };
  }
  payload.criadoEm = admin.firestore.FieldValue.serverTimestamp();
  const ref = await db.collection("estabelecimentos").add(payload);
  return { id: ref.id };
});