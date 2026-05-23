import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';

messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Background push:', remoteMessage);

  await notifee.displayNotification({
    title:
      remoteMessage.notification?.title ||
      remoteMessage.data?.title ||
      'Nova notificacao',
    body:
      remoteMessage.notification?.body ||
      remoteMessage.data?.body ||
      '',
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

AppRegistry.registerComponent(appName, () => App);
