import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';

import { db } from '../config/firebase';
import { REGION } from '../config/region';
import { validarAssinaturaMercadoPago } from '../utils/security';

export const webhookMercadoPago = onRequest(
  { region: REGION },
  async (req, res): Promise<void> => { // Adicionado explicitamente Promise<void>
    try {
      const segredoWebhook = process.env.MP_WEBHOOK_SECRET;
      const tokenWebhook = process.env.MP_WEBHOOK_TOKEN;

      // =========================
      // 🔐 TOKEN CHECK
      // =========================
      const tokenQuery = Array.isArray(req.query.token)
        ? req.query.token[0]
        : req.query.token;

      if (tokenWebhook && tokenQuery !== tokenWebhook) {
        console.warn("❌ Token inválido");
        res.sendStatus(401);
        return; // Retorno vazio para satisfazer o TS
      }

      const data = req.body?.data;

      if (!data?.id) {
        res.sendStatus(200);
        return;
      }

      const id: string = data.id;

      // =========================
      // 🔒 ASSINATURA CHECK
      // =========================
      if (segredoWebhook) {
        const assinaturaHeader =
          typeof req.headers["x-signature"] === "string"
            ? req.headers["x-signature"]
            : undefined;

        const requestIdHeader =
          typeof req.headers["x-request-id"] === "string"
            ? req.headers["x-request-id"]
            : undefined;

        const ok = validarAssinaturaMercadoPago(
          assinaturaHeader,
          requestIdHeader,
          id,
          segredoWebhook
        );

        if (!ok) {
          console.warn("❌ Assinatura inválida");
          res.sendStatus(401);
          return;
        }
      }

      // =========================
      // 🔁 BUSCA NO MERCADO PAGO
      // =========================
      let mpData: any;
      let tipo: 'pix' | 'assinatura' = 'assinatura';

      try {
        const resp = await axios.get(
          `https://api.mercadopago.com/v1/payments/${id}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
            },
          }
        );

        mpData = resp.data;
        tipo = 'pix';
      } catch {
        const resp = await axios.get(
          `https://api.mercadopago.com/preapproval/${id}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
            },
          }
        );

        mpData = resp.data;
        tipo = 'assinatura';
      }

      if (!mpData?.status) {
        console.error("❌ MP inválido");
        res.sendStatus(500);
        return;
      }

      // =====================================================
      // 💰 PIX (AGENDAMENTO / PAGAMENTO ÚNICO)
      // =====================================================
      if (tipo === 'pix') {
        console.log("💰 PIX recebido:", mpData.status);

        const eventId = req.headers["x-request-id"] as string;

        // 🔥 ANTI REPLAY REAL
        if (eventId) {
          const replayRef = db.collection("webhookReplay").doc(eventId);
          const replaySnap = await replayRef.get();

          if (replaySnap.exists) {
            console.warn("⚠️ replay detectado");
            res.sendStatus(200);
            return;
          }

          await replayRef.set({
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        const agendSnap = await db
          .collection("agendamentos")
          .where("paymentId", "==", id)
          .limit(1)
          .get();

        if (agendSnap.empty) {
          console.warn("⚠️ agendamento não encontrado");
          res.sendStatus(200);
          return;
        }

        const agendRef = agendSnap.docs[0].ref;
        const agend = agendSnap.docs[0].data();
        const aprovado = mpData.status === 'approved';

        if (agend.statusPagamento === mpData.status) {
          res.sendStatus(200);
          return;
        }

        await agendRef.update({
          statusPagamento: aprovado ? 'aprovado' : 'pendente',
          pagoEm: aprovado ? admin.firestore.FieldValue.serverTimestamp() : null,
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });

        if (aprovado) {
          await db.collection('notificacoes').add({
            clienteId: agend.clienteUid,
            titulo: "💰 Pagamento confirmado",
            mensagem: `Pagamento do serviço ${agend.servicoNome} aprovado!`,
            tipo: "pagamento_cliente",
            lida: false,
            criadoEm: admin.firestore.FieldValue.serverTimestamp(),
          });

          await db.collection('notificacoes').add({
            adminId: agend.adminId,
            titulo: "💰 Novo pagamento recebido",
            mensagem: `${agend.clienteNome} pagou ${agend.servicoNome}`,
            tipo: "pagamento_admin",
            lida: false,
            criadoEm: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        console.log("✅ PIX processado");
        res.sendStatus(200);
        return;
      }

      // =====================================================
      // 📦 ASSINATURA (PLANO)
      // =====================================================
      console.log("📦 assinatura:", mpData.status);

      const snap = await db
        .collection("estabelecimentos")
        .where("mercadoPagoId", "==", id)
        .limit(1)
        .get();

      if (snap.empty) {
        console.warn("⚠️ estabelecimento não encontrado");
        res.sendStatus(200);
        return;
      }

      const docRef = snap.docs[0].ref;
      const dados = snap.docs[0].data();

      const lastModified = mpData.last_modified
        ? new Date(mpData.last_modified)
        : new Date();

      if (dados.ultimaAtualizacaoMP) {
        const local = dados.ultimaAtualizacaoMP.toDate();
        if (local >= lastModified) {
          console.log("⏭️ evento duplicado ignorado");
          res.sendStatus(200);
          return;
        }
      }

      let assinaturaAtiva = false;
      let novaExpiracao: Date | null = null;

      if (mpData.status === "authorized") {
        assinaturaAtiva = true;
        const atual = dados.expiraEm?.toDate?.();

        if (atual && atual > new Date()) {
          novaExpiracao = new Date(atual);
          novaExpiracao.setDate(novaExpiracao.getDate() + 30);
        } else {
          novaExpiracao = new Date();
          novaExpiracao.setDate(novaExpiracao.getDate() + 30);
        }
      }

      if (["cancelled", "paused"].includes(mpData.status)) {
        assinaturaAtiva = false;
      }

      await docRef.update({
        assinaturaAtiva,
        statusPagamento: mpData.status,
        ...(novaExpiracao && {
          expiraEm: admin.firestore.Timestamp.fromDate(novaExpiracao),
        }),
        ultimaAtualizacaoMP: admin.firestore.FieldValue.serverTimestamp(),
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (mpData.status === "authorized" && dados.statusPagamento !== "authorized") {
        await db.collection("notificacoes").add({
          adminId: dados.adminId,
          titulo: "💰 Assinatura ativa",
          mensagem: "Seu plano foi ativado com sucesso!",
          tipo: "assinatura",
          lida: false,
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      console.log("✅ assinatura atualizada");
      res.sendStatus(200);
      return;

    } catch (error: any) {
      console.error("🔥 ERRO WEBHOOK:", error?.response?.data || error?.message);
      // Sempre responder 200 para o MP parar de tentar se for erro de código
      res.status(200).send("OK");
      return; 
    }
  }
);