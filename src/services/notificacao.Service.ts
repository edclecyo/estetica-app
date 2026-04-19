import messaging from '@react-native-firebase/messaging';
import firestore from '@react-native-firebase/firestore';
import { Alert } from 'react-native';

// Solicita permissão e salva o token do dispositivo
export async function registrarTokenPush(uid: string, tipo: 'cliente' | 'admin') {
  try {
    const permissao = await messaging().requestPermission();
    const autorizado =
      permissao === messaging.AuthorizationStatus.AUTHORIZED ||
      permissao === messaging.AuthorizationStatus.PROVISIONAL;
    if (!autorizado) return;

    const token = await messaging().getToken();
    if (!token) return;

    const colecao = tipo === 'admin' ? 'admins' : 'clientes';

    // ✅ Usa set+merge em vez de update (evita erro se doc não existir ainda)
    await firestore().collection(colecao).doc(uid).set(
      { fcmToken: token, tokenAtualizadoEm: firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    // ✅ Inscreve em tópico próprio para envios direcionados
    // Admin recebe em: admin_{uid} | Cliente recebe em: cliente_{uid}
    await messaging().subscribeToTopic(`${tipo}_${uid}`);

    console.log(`Token FCM salvo [${tipo}]:`, token);
  } catch (e) {
    console.log('Erro ao registrar token:', e);
  }
}

// ✅ Remove token ao fazer logout (evita notificações para usuário deslogado)
export async function removerTokenPush(uid: string, tipo: 'cliente' | 'admin') {
  try {
    const colecao = tipo === 'admin' ? 'admins' : 'clientes';

    await firestore().collection(colecao).doc(uid).set(
      { fcmToken: null },
      { merge: true }
    );

    await messaging().unsubscribeFromTopic(`${tipo}_${uid}`);
    console.log(`Token FCM removido [${tipo}]`);
  } catch (e) {
    console.log('Erro ao remover token:', e);
  }
}

// ✅ Escuta notificações com app aberto (Foreground) — mostra Alert nativo
export function escutarNotificacoes() {
  return messaging().onMessage(async remoteMessage => {
    const titulo = remoteMessage.notification?.title || 'Nova mensagem';
    const corpo  = remoteMessage.notification?.body  || '';

    console.log('Notificação foreground:', titulo);

    Alert.alert(titulo, corpo);
  });
}

// ✅ Configura handler para quando usuário toca na notificação (Background/Quit)
export function configurarAberturaPorNotificacao(
  onAbrir: (data: Record<string, string>) => void
) {
  // App em background — usuário tocou na notificação
  messaging().onNotificationOpenedApp(remoteMessage => {
    if (remoteMessage.data) {
      onAbrir(remoteMessage.data as Record<string, string>);
    }
  });

  // App fechado — verifica se foi aberto por uma notificação
  messaging().getInitialNotification().then(remoteMessage => {
    if (remoteMessage?.data) {
      onAbrir(remoteMessage.data as Record<string, string>);
    }
  });
}