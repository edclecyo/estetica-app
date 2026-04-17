import * as admin from 'firebase-admin';

// Evita reinicialização do Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

// Firestore
export const db = admin.firestore();

// Auth
export const auth = admin.auth();

// Messaging (FCM)
export const messaging = admin.messaging();

// Storage (bucket padrão do projeto)
export const bucket = admin.storage().bucket('agenda-beleza-75106.firebasestorage.app');