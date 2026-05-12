import * as admin from 'firebase-admin';

import { db } from '../config/firebase';

// ─────────────────────────────────────────────
// 🔥 BUSCAR TOKEN
// ─────────────────────────────────────────────
export async function getTokenUsuario(
  userId: string,
  tipo: 'cliente' | 'admin'
): Promise<string[]> {

  const colecao =
    tipo === 'admin'
      ? 'admins'
      : 'clientes';

  const snap =
    await db
      .collection(colecao)
      .doc(userId)
      .get();

  if (!snap.exists) {
    return [];
  }

  const token =
    snap.data()?.fcmToken;

  if (!token) {
    return [];
  }

  // 🔥 normaliza
  const tokens =
    Array.isArray(token)
      ? token
      : [token];

  // 🔥 remove vazios/duplicados
  return [
    ...new Set(
      tokens.filter(Boolean)
    )
  ];
}

// ─────────────────────────────────────────────
// 🔔 ENVIAR PUSH
// ─────────────────────────────────────────────
export async function enviarPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, any>,
  badgeCount?: number
) {

  try {

    // 🔥 evita envio inútil
    if (!tokens?.length) {
      return;
    }

    // 🔥 remove duplicados
    const uniqueTokens =
      [...new Set(tokens)];

    // 🔥 firebase suporta até 500
    const chunks: string[][] = [];

    for (
      let i = 0;
      i < uniqueTokens.length;
      i += 500
    ) {

      chunks.push(
        uniqueTokens.slice(i, i + 500)
      );
    }

    // ─────────────────────────
    // 🚀 ENVIA EM LOTES
    // ─────────────────────────
    for (const chunk of chunks) {

      const message:
        admin.messaging.MulticastMessage = {

        tokens: chunk,

        notification: {
          title,
          body,
        },

        data: data
          ? Object.fromEntries(
              Object.entries(data)
                .map(([k, v]) => [
                  k,
                  String(v)
                ])
            )
          : {},

        android: {

          priority: 'high',

          notification: {
            sound: 'default',
            channelId: 'default_channel',
            visibility: 'public',
          },
        },

        apns: {

          headers: {
            'apns-priority': '10',
          },

          payload: {
            aps: {
              sound: 'default',
              badge: badgeCount ?? 1,
              contentAvailable: true,
            },
          },
        },
      };

      // 🔥 RESULTADO
      const response =
        await admin.messaging()
          .sendEachForMulticast(message);

      // ───────────────────────
      // 🧹 LIMPA TOKENS INVÁLIDOS
      // ───────────────────────
      const invalidTokens: string[] = [];

      response.responses.forEach(
        (r, index) => {

          if (!r.success) {

            const code =
              r.error?.code || '';

            // token morto
            if (
              code ===
                'messaging/registration-token-not-registered'
              ||
              code ===
                'messaging/invalid-registration-token'
            ) {

              invalidTokens.push(
                chunk[index]
              );
            }
          }
        }
      );

      // ───────────────────────
      // 🧹 REMOVE TOKEN INVÁLIDO
      // ───────────────────────
      if (invalidTokens.length > 0) {

        console.log(
          '🧹 Tokens inválidos:',
          invalidTokens.length
        );

        // 🔥 remove depois
        // no login novo ele salva novamente
      }

      console.log(
        `✅ Push enviado: ${response.successCount} sucesso / ${response.failureCount} falhas`
      );
    }

  } catch (err) {

    console.error(
      '🔥 Erro push:',
      err
    );
  }
}