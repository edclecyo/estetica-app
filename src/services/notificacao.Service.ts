import auth from '@react-native-firebase/auth';
import messaging from '@react-native-firebase/messaging';
import firestore, { FieldValue } from '@react-native-firebase/firestore';
import notifee, { AndroidImportance } from '@notifee/react-native';

// 🔥 CRIAR CANAL (ANDROID)
async function criarCanal() {
  await notifee.createChannel({
    id: 'default_channel',
    name: 'Notificações',
    sound: 'default',
    importance: AndroidImportance.HIGH,
  });
}

// 🔥 BADGE
async function incrementarBadge() {
  const atual = (await notifee.getBadgeCount()) || 0;
  await notifee.setBadgeCount(atual + 1);
}

// 🔥 LIMPAR BADGE
export async function limparBadge() {
  await notifee.setBadgeCount(0);
}

// 📌 REGISTRAR TOKEN (CORRIGIDO)
export async function registrarTokenPush(uid: string, tipo: 'cliente' | 'admin') {
  try {
    await criarCanal();

    const authStatus = await messaging().requestPermission();

    const autorizado =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!autorizado) return;

    const token = await messaging().getToken();
    if (!token) return;

    const colecao = tipo === 'admin' ? 'admins' : 'clientes';

    await firestore().collection(colecao).doc(uid).set(
      {
        fcmToken: token,
        tokenAtualizadoEm: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // ❌ REMOVIDO: subscribeToTopic
    // 👉 NÃO USAR MAIS TOPIC

    console.log(`Token FCM salvo [${tipo}]:`, token);

  } catch (e) {
    console.log('Erro ao registrar token:', e);
  }
}

// ❌ REMOVE TOKEN (CORRIGIDO)
export async function removerTokenPush(uid: string, tipo: 'cliente' | 'admin') {
  try {
    const colecao = tipo === 'admin' ? 'admins' : 'clientes';

    await firestore().collection(colecao).doc(uid).set(
      { fcmToken: null },
      { merge: true }
    );

    console.log(`Token FCM removido [${tipo}]`);

  } catch (e) {
    console.log('Erro ao remover token:', e);
  }
}

// 🔔 FOREGROUND
export function escutarNotificacoes() {
  return messaging().onMessage(async remoteMessage => {

    const titulo =
      remoteMessage.notification?.title || 'Nova mensagem';

    const corpo =
      remoteMessage.notification?.body || '';

    // 🔥 MOSTRA PUSH
    await notifee.displayNotification({
      title: titulo,
      body: corpo,

      android: {
        channelId: 'default_channel',
        pressAction: { id: 'default' },
      },

      ios: {
        sound: 'default',
      },
    });

    // 🔥 BADGE
    await incrementarBadge();

    // 🔥 OPCIONAL:
    // força atualização do Firestore
    const user = auth().currentUser;

    if (user?.uid) {
      await firestore()
        .collection('usuarios_online')
        .doc(user.uid)
        .set(
          {
            ultimaNotificacao: Date.now(),
          },
          { merge: true }
        );
    }

    console.log('✅ Push foreground recebido');
  });
}

// 📲 ABERTURA POR CLIQUE
export function configurarAberturaPorNotificacao(
  onAbrir: (data: Record<string, string>) => void
) {
  messaging().onNotificationOpenedApp(remoteMessage => {
    if (remoteMessage?.data) {
      onAbrir(remoteMessage.data as Record<string, string>);
    }
  });

  messaging().getInitialNotification().then(remoteMessage => {
    if (remoteMessage?.data) {
      onAbrir(remoteMessage.data as Record<string, string>);
    }
  });
}