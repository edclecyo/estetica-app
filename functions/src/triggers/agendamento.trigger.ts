import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { REGION } from '../config/region';
import { enviarPush } from '../services/notificacao.service';

export const onAgendamentoUpdate = onDocumentUpdated(
  { document: "agendamentos/{docId}", region: REGION },
  async (event) => {
    const antes = event.data?.before.data();
    const depois = event.data?.after.data();

    if (!antes || !depois) return;

   if (antes.status !== depois.status) {

  let titulo = '';
  let mensagem = '';
  let type: 'APPOINTMENT_DONE' | 'NEW_SLOT' | 'GENERAL' = 'GENERAL';

  // ===== CLIENTE RECEBE =====

  if (depois.status === 'confirmado') {
    type = 'NEW_SLOT';
    titulo = 'Agendamento Confirmado';
    mensagem = `Seu agendamento de ${depois.servicoNome} foi confirmado.`;
  }

  if (depois.status === 'cancelado') {
    type = 'GENERAL';
    titulo = 'Agendamento Cancelado';
    mensagem = `Seu agendamento de ${depois.servicoNome} foi cancelado.`;
  }

  if (depois.status === 'concluido') {
    type = 'APPOINTMENT_DONE';
    titulo = 'Atendimento Concluído';
    mensagem = `Seu serviço de ${depois.servicoNome} foi concluído.`;
  }

  if (titulo) {
    // 🔔 PUSH → cliente
    if (depois.fcmTokenCliente) {
      await enviarPush(
        depois.fcmTokenCliente,
        titulo,
        mensagem,
        {
          type,
          agendamentoId: event.params.docId,
          estabelecimentoId: depois.estabelecimentoId
        }
      );
    }

    // 💾 SALVA NOTIFICAÇÃO → SOMENTE CLIENTE
    await db.collection('notificacoes').add({
      clienteId: depois.clienteUid,
      // ❌ NÃO SALVAR adminId AQUI
      agendamentoId: event.params.docId,
      estabelecimentoId: depois.estabelecimentoId,
      estabelecimentoNome: depois.estabelecimentoNome,
      titulo,
      mensagem,
      type,
      lida: false,
      apagada: false,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}if (antes.status !== depois.status) {

  let titulo = '';
  let mensagem = '';
  let type: 'APPOINTMENT_DONE' | 'NEW_SLOT' | 'GENERAL' = 'GENERAL';

  // ===== CLIENTE RECEBE =====

  if (depois.status === 'confirmado') {
    type = 'NEW_SLOT';
    titulo = 'Agendamento Confirmado';
    mensagem = `Seu agendamento de ${depois.servicoNome} foi confirmado.`;
  }

  if (depois.status === 'cancelado') {
    type = 'GENERAL';
    titulo = 'Agendamento Cancelado';
    mensagem = `Seu agendamento de ${depois.servicoNome} foi cancelado.`;
  }

  if (depois.status === 'concluido') {
    type = 'APPOINTMENT_DONE';
    titulo = 'Atendimento Concluído';
    mensagem = `Seu serviço de ${depois.servicoNome} foi concluído.`;
  }

  if (titulo) {
    // 🔔 PUSH → cliente
    if (depois.fcmTokenCliente) {
      await enviarPush(
        depois.fcmTokenCliente,
        titulo,
        mensagem,
        {
          type,
          agendamentoId: event.params.docId,
          estabelecimentoId: depois.estabelecimentoId
        }
      );
    }

    // 💾 SALVA NOTIFICAÇÃO → SOMENTE CLIENTE
    await db.collection('notificacoes').add({
      clienteId: depois.clienteUid,
      // ❌ NÃO SALVAR adminId AQUI
      agendamentoId: event.params.docId,
      estabelecimentoId: depois.estabelecimentoId,
      estabelecimentoNome: depois.estabelecimentoNome,
      titulo,
      mensagem,
      type,
      lida: false,
      apagada: false,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

    // RANKING (mantido igual)
    const notaNova = depois.avaliacaoCliente;
    const notaAntiga = antes.avaliacaoCliente;

   if (
  depois.status === 'concluido' &&
  notaNova &&
  (notaAntiga == null || notaAntiga !== notaNova)
) {
      const estRef = db.collection('estabelecimentos').doc(depois.estabelecimentoId);

      await db.runTransaction(async (t) => {
        const estDoc = await t.get(estRef);
        if (!estDoc.exists) return;

        const d = estDoc.data() || {};

        const isEdicao = notaAntiga !== undefined && notaAntiga !== null;

        const totalAvaliacoes = isEdicao
          ? (d.quantidadeAvaliacoes || 1)
          : (d.quantidadeAvaliacoes || 0) + 1;

        const somaNotas = (d.somaNotas || 0) - (notaAntiga || 0) + notaNova;

        const novaMedia = somaNotas / totalAvaliacoes;

        t.update(estRef, {
          avaliacao: Math.round(novaMedia * 10) / 10,
          quantidadeAvaliacoes: totalAvaliacoes,
          somaNotas: somaNotas,
          rankingScore: (novaMedia * 2) + (totalAvaliacoes * 0.5),
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
        });
      });
    }
  }
);