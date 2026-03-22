import messaging from '@react-native-firebase/messaging';
import firestore from '@react-native-firebase/firestore';
import { Alert } from 'react-native';

export async function registrarTokenPush(uid: string, tipo: 'cliente' | 'admin') {
  try {
    const permissao = await messaging().requestPermission();
    const autorizado =
      permissao === messaging.AuthorizationStatus.AUTHORIZED ||
      permissao === messaging.AuthorizationStatus.PROVISIONAL;

    console.log(`🔔 [${tipo}] Permissão:`, autorizado);
    if (!autorizado) return;

    const token = await messaging().getToken();
    console.log(`🔑 [${tipo}] Token:`, token ? token.substring(0, 30) + '...' : 'NULL');
    if (!token) return;

    const colecao = tipo === 'admin' ? 'admins' : 'clientes';

    await firestore().collection(colecao).doc(uid).set(
      { fcmToken: token, tokenAtualizadoEm: firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    console.log(`✅ [${tipo}] Token salvo em: ${colecao}/${uid}`);

    await messaging().subscribeToTopic(`${tipo}_${uid}`);
    console.log(`✅ [${tipo}] Inscrito no tópico: ${tipo}_${uid}`);

  } catch (e) {
    console.log('❌ Erro ao registrar token:', e);
  }
}

export async function removerTokenPush(uid: string, tipo: 'cliente' | 'admin') {
  try {
    const colecao = tipo === 'admin' ? 'admins' : 'clientes';
    await firestore().collection(colecao).doc(uid).set(
      { fcmToken: null },
      { merge: true }
    );
    await messaging().unsubscribeFromTopic(`${tipo}_${uid}`);
    console.log(`✅ Token FCM removido [${tipo}]`);
  } catch (e) {
    console.log('❌ Erro ao remover token:', e);
  }
}

// ✅ Foreground — usado APENAS no App.tsx
// NÃO use junto com o onMessage do AuthContext — causa duplicata
export function escutarNotificacoes() {
  return messaging().onMessage(async remoteMessage => {
    const titulo = remoteMessage.notification?.title || 'Nova mensagem';
    const corpo  = remoteMessage.notification?.body  || '';
    const tipo   = remoteMessage.data?.tipo || '';

    console.log('📩 Notificação foreground recebida:', titulo, '| tipo:', tipo);

    // ✅ Não mostra Alert aqui — AuthContext já cuida disso com filtro de admin
    // Apenas loga para debug
  });
}

export function configurarAberturaPorNotificacao(
  onAbrir: (data: Record<string, string>) => void
) {
  messaging().onNotificationOpenedApp(remoteMessage => {
    if (remoteMessage.data) {
      onAbrir(remoteMessage.data as Record<string, string>);
    }
  });

  messaging().getInitialNotification().then(remoteMessage => {
    if (remoteMessage?.data) {
      onAbrir(remoteMessage.data as Record<string, string>);
    }
  });
}