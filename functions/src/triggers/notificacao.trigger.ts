import { onDocumentCreated } from 'firebase-functions/v2/firestore';

import { REGION } from '../config/region';

import {
  getTokenUsuario,
  enviarPush
} from '../services/notificacao.service';

// ─────────────────────────────
// 🚀 AO CRIAR NOTIFICAÇÃO
// ─────────────────────────────
export const aoCriarNotificacao =
  onDocumentCreated(
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

      const docId =
        event.params?.docId || '';

      try {

        // ─────────────────────────
        // 🔥 PAYLOAD
        // ─────────────────────────
        const pushData = {

          type:
            String(
              data.type || 'notification'
            ),

          docId:
            String(docId),

          agendamentoId:
            String(
              data.agendamentoId || ''
            ),

          clienteNome:
            String(
              data.clienteNome || ''
            ),

          servicoNome:
            String(
              data.servicoNome || ''
            ),

          formaPagamento:
            String(
              data.formaPagamento || ''
            ),
        };

        // ─────────────────────────
        // 👤 CLIENTE
        // ─────────────────────────
        if (
          data.tipo === 'cliente' &&
          data.clienteId
        ) {

          const tokens =
            await getTokenUsuario(
              data.clienteId,
              'cliente'
            );

          if (!tokens?.length) {
            return;
          }

          await enviarPush(
            tokens,
            data.titulo || 'Atualização',
            data.mensagem || '',
            pushData
          );

          console.log(
            `✅ Push cliente enviado: ${data.clienteId}`
          );
        }

        // ─────────────────────────
        // 🧑‍💼 ADMIN
        // ─────────────────────────
        if (
          data.tipo === 'admin' &&
          data.adminId
        ) {

          const tokens =
            await getTokenUsuario(
              data.adminId,
              'admin'
            );

          if (!tokens?.length) {
            return;
          }

          await enviarPush(
            tokens,
            data.titulo || 'Nova atualização',
            data.mensagem || '',
            pushData
          );

          console.log(
            `✅ Push admin enviado: ${data.adminId}`
          );
        }

      } catch (err: any) {

        console.error(
          '❌ Erro ao enviar push:',
          err?.message || err
        );
      }
    }
  );