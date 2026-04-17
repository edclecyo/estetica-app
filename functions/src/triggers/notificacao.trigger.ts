import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

import { REGION } from '../config/region';
import { enviarPush } from '../services/notificacao.service'; // Usando o path correto
import { getTokenUsuario } from '../services/notificacao.service';

export const aoCriarNotificacao = onDocumentCreated(
  { document: "notificacoes/{docId}", region: REGION },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    const targetId = data.adminId || data.clienteId;

    if (!targetId) {
      console.warn("⚠️ Notificação criada sem um destinatário (adminId ou clienteId).");
      return;
    }

    try {
      // Busca o token na coleção centralizada 'usuarios'
      const token = await getTokenUsuario(targetId);

      if (token) {
        await enviarPush(
          token,
          data.titulo || "Novidade no BeautyHub",
          data.mensagem || data.msg || ""
        );
        console.log(`✅ Push disparado com sucesso para: ${targetId}`);
      } else {
        console.log(`ℹ️ Usuário ${targetId} não possui um FCM Token registrado.`);
      }
    } catch (err) {
      console.error(`❌ Erro ao processar push para ${targetId}:`, err);
    }
  }
);