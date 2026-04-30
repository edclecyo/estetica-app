import * as admin from 'firebase-admin';
import { db } from '../config/firebase';

/**
 * 📣 ENVIAR NOTIFICAÇÃO PUSH
 */
export async function enviarPush(
  token: string | null,
  title: string,
  body: string,
  data?: Record<string, string>
) {
  if (!token) return;

  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      data: data ?? {},
    });

  } catch (err: any) {
    console.error("Erro ao enviar push:", err?.code || err);
  }
}

/**
 * 🔑 BUSCAR TOKEN
 */
export async function getTokenUsuario(uid: string) {
  if (!uid) return null;

  const snap = await db.collection('usuarios').doc(uid).get();
  return snap.data()?.fcmToken || null;
}

export const getTokenAdmin = getTokenUsuario;
export const getTokenCliente = getTokenUsuario;