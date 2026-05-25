import { initializeApp, getApps, getApp as getFirebaseApp } from 'firebase/app';

export const firebaseConfig = {
  apiKey: 'AIzaSyCyIXpjEZYgPysywUG-zF89LaMXBEUs9MU',
  authDomain: 'agenda-beleza-75106.firebaseapp.com',
  projectId: 'agenda-beleza-75106',
  storageBucket: 'agenda-beleza-75106.firebasestorage.app',
  messagingSenderId: '1043439367326',
  appId: '1:1043439367326:web:9eb884de250932f9baf78f',
};

export const firebaseVapidKey = 'BGyeETheXqEwzWEB6hGHLitv8oE3oKSx9KSReacLwzeqxrvo4_TQVZZ5DaUw5TqsyEnh--0924OIeb7nbXMaWNg';

export function getWebApp() {
  return getApps().length ? getFirebaseApp() : initializeApp(firebaseConfig);
}
