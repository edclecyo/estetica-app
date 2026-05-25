import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from 'firebase/messaging';
import { firebaseVapidKey, getWebApp } from './firebase-core';

type RemoteMessage = {
  notification?: {
    title?: string;
    body?: string;
  };
  data?: Record<string, string>;
};

let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

async function supported() {
  return typeof window !== 'undefined' && typeof Notification !== 'undefined' && await isSupported();
}

async function getServiceWorkerRegistration() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  if (!swRegistrationPromise) {
    swRegistrationPromise = navigator.serviceWorker.register('/app-iphone/firebase-messaging-sw.js');
  }

  return swRegistrationPromise;
}

async function requestPermission() {
  if (!await supported()) return messaging.AuthorizationStatus.DENIED;

  const permission = await Notification.requestPermission();

  if (permission === 'granted') return messaging.AuthorizationStatus.AUTHORIZED;
  return messaging.AuthorizationStatus.DENIED;
}

async function getWebToken() {
  if (!await supported()) return '';

  if (!firebaseVapidKey) {
    console.warn('Firebase Web Push VAPID key nao configurada.');
    return '';
  }

  const serviceWorkerRegistration = await getServiceWorkerRegistration();
  if (!serviceWorkerRegistration) return '';

  return getToken(getMessaging(getWebApp()), {
    vapidKey: firebaseVapidKey,
    serviceWorkerRegistration,
  });
}

function listenForeground(callback: (message: RemoteMessage) => void) {
  let unsubscribe = () => {};

  supported().then(ok => {
    if (!ok) return;

    unsubscribe = onMessage(getMessaging(getWebApp()), payload => {
      callback({
        notification: {
          title: payload.notification?.title,
          body: payload.notification?.body,
        },
        data: payload.data as Record<string, string> | undefined,
      });
    });
  });

  return () => unsubscribe();
}

export default function messaging() {
  return {
    requestPermission,
    getToken: getWebToken,
    onMessage: listenForeground,
    onNotificationOpenedApp: () => () => {},
    getInitialNotification: async () => null,
    setBackgroundMessageHandler: () => {},
  };
}

messaging.AuthorizationStatus = {
  AUTHORIZED: 1,
  PROVISIONAL: 2,
  DENIED: 0,
};
