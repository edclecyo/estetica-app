import { db, messaging } from '../config/firebase';

/**
 * 📣 ENVIAR NOTIFICAÇÃO PUSH
 */
export async function enviarPush(token: string | null, title: string, body: string, data?: Record<string, string>) {
  if (!token) return;

  try {
    await messaging.send({
      token,
      notification: { title, body },
      ...(data && { data }) 
    });
  } catch (err: any) {
    // Erros de "registration-token-not-registered" são comuns quando o app é desinstalado
    console.error("Erro ao enviar push:", err?.code);
  }
}

/**
 * 🔑 BUSCAR TOKEN NA COLEÇÃO CENTRALIZADA
 * Ajustado para buscar na coleção 'usuarios' conforme seu sistema de Auth
 */
export async function getTokenUsuario(uid: string) {
  if (!uid) return null;
  const snap = await db.collection('usuarios').doc(uid).get();
  return snap.data()?.fcmToken || null;
}

// Aliases para manter compatibilidade com seus outros serviços se necessário
export const getTokenAdmin = getTokenUsuario;
export const getTokenCliente = getTokenUsuario;