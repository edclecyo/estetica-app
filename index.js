import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee from '@notifee/react-native'; // 👈 FALTAVA ISSO
import App from './App';
import { name as appName } from './app.json';

// 🔥 BACKGROUND (APP FECHADO)
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('📩 Background:', remoteMessage);

  await notifee.displayNotification({
    title: remoteMessage.notification?.title || 'Nova notificação',
    body: remoteMessage.notification?.body || '',
    android: {
      channelId: 'default_channel',
      pressAction: {
        id: 'default',
      },
    },
    ios: {
      sound: 'default',
    },
  });
});

// 🚀 REGISTRO
AppRegistry.registerComponent(appName, () => App);