import messaging from '@react-native-firebase/messaging';
import firestore from '@react-native-firebase/firestore';

// Solicita permissão e salva o token do dispositivo
export async function registrarTokenPush(uid: string, tipo: 'cliente' | 'admin') {
  try {
    const permissao = await messaging().requestPermission();
    const autorizado =
      permissao === messaging.AuthorizationStatus.AUTHORIZED ||
      permissao === messaging.AuthorizationStatus.PROVISIONAL;

    if (!autorizado) return;

    const token = await messaging().getToken();
    const colecao = tipo === 'admin' ? 'admins' : 'clientes';
    await firestore().collection(colecao).doc(uid).update({ fcmToken: token });
    console.log('Token FCM salvo:', token);
  } catch (e) {
    console.log('Erro ao registrar token:', e);
  }
}

// Escuta notificações quando app está aberto
export function escutarNotificacoes() {
  return messaging().onMessage(async remoteMessage => {
    console.log('Notificação recebida:', remoteMessage.notification?.title);
  });
}