import {
  createUserWithEmailAndPassword,
  getAuth as getFirebaseAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { getWebApp } from './firebase-core';

const provider = new GoogleAuthProvider();

function wrapUser(user: any) {
  if (!user || user.__beautyHubWrapped) return user;
  user.__beautyHubWrapped = true;
  user.updateProfile = (profile: any) => updateProfile(user, profile);
  user.getIdToken = user.getIdToken.bind(user);
  return user;
}

function service() {
  const auth = getFirebaseAuth(getWebApp()) as any;
  return {
    get currentUser() {
      return wrapUser(auth.currentUser);
    },
    onAuthStateChanged(callback: any) {
      return onAuthStateChanged(auth, user => callback(wrapUser(user)));
    },
    signInWithEmailAndPassword(email: string, password: string) {
      return signInWithEmailAndPassword(auth, email, password).then(res => ({ user: wrapUser(res.user) }));
    },
    createUserWithEmailAndPassword(email: string, password: string) {
      return createUserWithEmailAndPassword(auth, email, password).then(res => ({ user: wrapUser(res.user) }));
    },
    signInWithCredential(credential: any) {
      return signInWithCredential(auth, credential).then(res => ({ user: wrapUser(res.user) }));
    },
    signOut() {
      return signOut(auth);
    },
    sendPasswordResetEmail(email: string) {
      return sendPasswordResetEmail(auth, email);
    },
  };
}

function auth() {
  return service();
}

auth.GoogleAuthProvider = {
  credential(idToken: string) {
    return GoogleAuthProvider.credential(idToken);
  },
};

export function getAuth() {
  return getFirebaseAuth(getWebApp());
}

export function firebaseSignOut(authInstance = getAuth()) {
  return signOut(authInstance);
}

export { onIdTokenChanged, onAuthStateChanged, GoogleAuthProvider, signInWithPopup };
export { firebaseSignOut as signOut };
export type FirebaseAuthTypes = any;
export default auth;
