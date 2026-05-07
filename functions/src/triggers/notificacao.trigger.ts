import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { REGION } from '../config/region';
import { getTokenUsuario, enviarPush } from '../services/notificacao.service';

export const aoCriarNotificacao = onDocumentCreated(
  { document: "notificacoes/{docId}", region: REGION },
  async (event) => {

    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data() as any;
    const docId = event.params?.docId || '';

    const pushData = {
  type: String(data.type || "notification"),
  docId: String(docId),
  agendamentoId: String(data.agendamentoId || ""),
  clienteNome: String(data.clienteNome || ""),
  servicoNome: String(data.servicoNome || ""),
  formaPagamento: String(data.formaPagamento || ""),
};

    try {

      // ─────────────────────────────
      // 👤 CLIENTE
      // ─────────────────────────────
      if (data.tipo === 'cliente' && data.userId) {

        const tokens = await getTokenUsuario(data.userId, 'cliente');

        let title = "Atualização";
        let body = data.mensagem || "";

        switch (data.type) {

          case "agendamento":
            title = "Agendamento confirmado";
            body = data.mensagem || "Seu agendamento foi confirmado.";
            break;

          case "cancelamento":
            title = "Agendamento cancelado";
            body = data.mensagem || "Seu agendamento foi cancelado.";
            break;

          case "lembrete":
            title = "Seu horário é hoje!";
            body = data.mensagem || "Não esqueça do seu horário.";
            break;
        }

        await enviarPush(
          tokens,
          title,
          body,
          pushData
        );

        console.log(`✅ Push cliente enviado: ${data.userId}`);
      }

      // ─────────────────────────────
      // 🧑‍💼 ADMIN
      // ─────────────────────────────
      if (data.tipo === 'admin' && data.userId) {

        const tokens = await getTokenUsuario(data.userId, 'admin');

        let title = "Nova atualização";
        let body = data.mensagem || "";

        switch (data.type) {

          case "agendamento":
            title = "Novo agendamento";
            body = data.mensagem || "Um cliente fez um novo agendamento.";
            break;

          case "cancelamento":
            title = "Agendamento cancelado";
            body = data.mensagem || "Um agendamento foi cancelado.";
            break;

          case "lembrete":
            title = "Lembrete de horário";
            body = data.mensagem || "Existe um horário próximo.";
            break;
        }

        await enviarPush(
          tokens,
          title,
          body,
          pushData
        );

        console.log(`✅ Push admin enviado: ${data.userId}`);
      }

    } catch (err: any) {
      console.error("❌ Erro ao enviar push:", err?.message || err);
    }
  }
);