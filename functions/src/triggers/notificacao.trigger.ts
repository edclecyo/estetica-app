import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';

import { REGION } from '../config/region';
import { db } from '../config/firebase';

import {
  getTokenUsuario,
  enviarPush,
} from '../services/notificacao.service';

function getDedupeKey(data: any): string {
  if (data.dedupeKey) {
    return String(data.dedupeKey);
  }

  if (
    data.agendamentoId &&
    data.tipo === 'admin' &&
    (
      data.type === 'agendamento' ||
      data.type === 'NEW_BOOKING'
    )
  ) {
    return `agendamento:${data.agendamentoId}:admin:novo`;
  }

  if (
    data.agendamentoId &&
    data.tipo === 'cliente' &&
    data.type === 'agendamento'
  ) {
    return `agendamento:${data.agendamentoId}:cliente:confirmado`;
  }

  return '';
}

async function claimDedupe(
  dedupeKey: string,
  docId: string
): Promise<boolean> {
  if (!dedupeKey) {
    return true;
  }

  try {
    await db
      .collection('notificacaoLocks')
      .doc(dedupeKey)
      .create({
        docId,
        criadoEm: FieldValue.serverTimestamp(),
      });

    return true;
  } catch {
    return false;
  }
}

export const aoCriarNotificacao = onDocumentCreated(
  {
    document: 'notificacoes/{docId}',
    region: REGION,
    maxInstances: 20,
  },

  async (event) => {
    const snapshot = event.data;

    if (!snapshot) {
      return;
    }

    const data = snapshot.data() as any;
    const docId = event.params?.docId || '';
const titulo = String(data.titulo || '').trim();
const mensagem = String(data.mensagem || data.msg || '').trim();

if (!titulo && !mensagem) {
  await snapshot.ref.update({
    apagada: true,
    lida: true,
    pushEnviado: false,
    pushIgnorada: true,
    pushErro: 'Notificação sem título e mensagem',
    pushTentadoEm: FieldValue.serverTimestamp(),
  });

  console.log('⚠️ Notificação vazia ignorada:', docId);
  return;
}
    if (data.pushEnviado === true) {
      return;
    }

    try {
      const dedupeKey = getDedupeKey(data);
      const canSendPush = await claimDedupe(
        dedupeKey,
        docId
      );

      if (!canSendPush) {
        await snapshot.ref.update({
          apagada: true,
          pushEnviado: false,
          pushDuplicada: true,
          pushErro: 'Notificação duplicada',
          pushTentadoEm: FieldValue.serverTimestamp(),
        });

        return;
      }

      const pushData = {
        type: String(data.type || 'notification'),
        docId: String(docId),
        tela: String(data.tela || ''),
        agendamentoId: String(data.agendamentoId || ''),
        estabelecimentoId: String(data.estabelecimentoId || ''),
        clienteNome: String(data.clienteNome || ''),
        servicoNome: String(data.servicoNome || ''),
        formaPagamento: String(data.formaPagamento || ''),
      };

      if (data.tipo === 'cliente' && data.clienteId) {
        const tokens = await getTokenUsuario(
          data.clienteId,
          'cliente'
        );

        if (!tokens?.length) {
          await snapshot.ref.update({
            pushEnviado: false,
            pushErro: 'Sem token',
            pushTentadoEm: FieldValue.serverTimestamp(),
          });

          return;
        }

        await enviarPush(
  tokens,
  titulo || 'Atualização',
  mensagem,
  pushData
);

        await snapshot.ref.update({
          pushEnviado: true,
          pushEnviadoEm: FieldValue.serverTimestamp(),
        });

        console.log(`✅ Push cliente enviado: ${data.clienteId}`);
        return;
      }

      if (data.tipo === 'admin' && data.adminId) {
        const tokens = await getTokenUsuario(
          data.adminId,
          'admin'
        );

        if (!tokens?.length) {
          await snapshot.ref.update({
            pushEnviado: false,
            pushErro: 'Sem token',
            pushTentadoEm: FieldValue.serverTimestamp(),
          });

          return;
        }

        await enviarPush(
  tokens,
  titulo || 'Nova atualização',
  mensagem,
  pushData
);

        await snapshot.ref.update({
          pushEnviado: true,
          pushEnviadoEm: FieldValue.serverTimestamp(),
        });

        console.log(`✅ Push admin enviado: ${data.adminId}`);
      }
    } catch (err: any) {
      await snapshot.ref.update({
        pushEnviado: false,
        pushErro: String(err?.message || err),
        pushTentadoEm: FieldValue.serverTimestamp(),
      });

      console.error(
        '❌ Erro ao enviar push:',
        err?.message || err
      );
    }
  }
);
