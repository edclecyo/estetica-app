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
): Promise<boolean> {
  try {
    if (!tokens?.length) return false;

    const uniqueTokens = [...new Set(tokens)];
    const chunks: string[][] = [];

    for (let i = 0; i < uniqueTokens.length; i += 500) {
      chunks.push(uniqueTokens.slice(i, i + 500));
    }

    let totalSuccess = 0;

    for (const chunk of chunks) {
      const payloadData = {
        ...(data
          ? Object.fromEntries(
              Object.entries(data).map(([k, v]) => [k, String(v)])
            )
          : {}),
        title: String(title || ''),
        body: String(body || ''),
      };

      const message: admin.messaging.MulticastMessage = {
        tokens: chunk,

        data: payloadData,

        android: {
          priority: 'high',
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

      const response = await admin.messaging().sendEachForMulticast(message);

      totalSuccess += response.successCount;

      console.log(
        `✅ Push enviado: ${response.successCount} sucesso / ${response.failureCount} falhas`
      );
    }

    return totalSuccess > 0;
  } catch (err) {
    console.error('🔥 Erro push:', err);
    return false;
  }
}
