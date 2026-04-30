import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { REGION } from '../config/region';
import { enviarPush, getTokenUsuario } from '../services/notificacao.service';

export const aoCriarNotificacao = onDocumentCreated(
  { document: "notificacoes/{docId}", region: REGION },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data() as any;

    try {
      // ===== CLIENTE =====
      if (data.clienteId) {
        const tokenCliente = await getTokenUsuario(data.clienteId);

        if (tokenCliente && tokenCliente.length > 10) {
          await enviarPush(
            tokenCliente,
            data.titulo || "Novidade no BeautyHub",
            data.mensagem || data.msg || "",
            {
              type: data.type || "notification",
              docId: event.params.docId,
            }
          );

          console.log(`✅ Push cliente: ${data.clienteId}`);
        }
      }

      // ===== ADMIN =====
      if (data.adminId) {
        const tokenAdmin = await getTokenUsuario(data.adminId);

        if (tokenAdmin && tokenAdmin.length > 10) {
          await enviarPush(
            tokenAdmin,
            data.titulo || "Novidade no BeautyHub",
            data.mensagem || data.msg || "",
            {
              type: data.type || "notification",
              docId: event.params.docId,
            }
          );

          console.log(`✅ Push admin: ${data.adminId}`);
        }
      }

    } catch (err) {
      console.error(`❌ Erro ao enviar push:`, err);
    }
  }
);