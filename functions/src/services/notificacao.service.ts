import * as admin from 'firebase-admin';
import { db } from '../config/firebase';

// ─────────────────────────────────────────────
// 🔥 BUSCAR TOKEN
// ─────────────────────────────────────────────
export async function getTokenUsuario(
  userId: string,
  tipo: 'cliente' | 'admin'
): Promise<string[]> {

  const colecao = tipo === 'admin' ? 'admins' : 'clientes';

  const snap = await db.collection(colecao).doc(userId).get();

  if (!snap.exists) return [];

  const token = snap.data()?.fcmToken;

  if (!token) return [];

  return Array.isArray(token) ? token : [token];
}

// ─────────────────────────────────────────────
// 🔔 ENVIAR PUSH (AGORA LIMPO)
// ─────────────────────────────────────────────
export async function enviarPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, any>,
  badgeCount?: number
) {
  try {
    if (!tokens.length) return;

    const message: admin.messaging.MulticastMessage = {
      tokens,

      notification: {
        title,
        body,
      },

      data: data
        ? Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v)])
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

    await admin.messaging().sendEachForMulticast(message);

  } catch (err) {
    console.error('🔥 Erro push:', err);
  }
}