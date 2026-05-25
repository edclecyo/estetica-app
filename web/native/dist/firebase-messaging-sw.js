/* global firebase */
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCyIXpjEZYgPysywUG-zF89LaMXBEUs9MU',
  authDomain: 'agenda-beleza-75106.firebaseapp.com',
  projectId: 'agenda-beleza-75106',
  storageBucket: 'agenda-beleza-75106.firebasestorage.app',
  messagingSenderId: '1043439367326',
  appId: '1:1043439367326:web:9eb884de250932f9baf78f',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const data = payload.data || {};
  const title = payload.notification?.title || data.title || 'BeautyHub';
  const body = payload.notification?.body || data.body || 'Nova atualizacao';

  self.registration.showNotification(title, {
    body,
    icon: '/assets/logo.png',
    badge: '/assets/logo.png',
    data,
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const targetUrl = '/app-iphone/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          return;
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
