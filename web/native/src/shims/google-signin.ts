import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getWebApp } from './firebase-core';

export const GoogleSignin = {
  configure() {},
  hasPlayServices: async () => true,
  signOut: async () => {},
  revokeAccess: async () => {},
  async signIn() {
    const result = await signInWithPopup(getAuth(getWebApp()), new GoogleAuthProvider());
    const token = await result.user.getIdToken();
    return { data: { idToken: token } };
  },
};
