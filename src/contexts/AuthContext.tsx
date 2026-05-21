import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  FirebaseAuthTypes,
  getAuth,
  onIdTokenChanged,
  signOut as firebaseSignOut,
} from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import type { Admin } from '../types';

interface AuthContextData {
  user: FirebaseAuthTypes.User | null;
  admin: Admin | null;
  cliente: FirebaseAuthTypes.User | null;
  loading: boolean;
  isAdmin: boolean;
  isCliente: boolean;
  isSuperAdmin: boolean;
  isResolvingAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({
  user: null,
  admin: null,
  cliente: null,
  loading: true,
  isAdmin: false,
  isCliente: false,
  isSuperAdmin: false,
  isResolvingAdmin: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false); // ✅ estado próprio
  const [loading, setLoading] = useState(true);
  const [isResolvingAdmin, setIsResolvingAdmin] = useState(true);

  // --- MONITORAMENTO DE AUTH ---
  useEffect(() => {

  const unsubscribe = onIdTokenChanged(
    getAuth(),
    async firebaseUser => {

      try {

        setLoading(true);
        setIsResolvingAdmin(true);

        // 🔥 deslogado
        if (!firebaseUser) {
          setUser(null);
          setAdmin(null);
          setIsSuperAdmin(false);

          setLoading(false);
          setIsResolvingAdmin(false);

          return;
        }

        await firebaseUser.getIdToken();

        setUser(firebaseUser);

        const snap = await firestore()
          .collection('admins')
          .doc(firebaseUser.uid)
          .get();

        if (snap.exists && snap.data()?.ativo) {

          const dados = snap.data()!;

          setAdmin({
            ...dados,
            id: firebaseUser.uid,
          } as Admin);

          setIsSuperAdmin(
            dados.cargo === 'Super Admin'
          );

        } else {

          setAdmin(null);
          setIsSuperAdmin(false);
        }

      } catch (e) {

        console.log('Erro auth:', e);

        setAdmin(null);
        setIsSuperAdmin(false);

      } finally {

        setLoading(false);
        setIsResolvingAdmin(false);
      }
    }
  );

  return unsubscribe;

}, []);

  // --- LOGOUT ---
 const signOut = async () => {
  const currentUser = getAuth().currentUser;

  if (!currentUser) return;

  try {
    await firebaseSignOut(getAuth());
  } catch (e) {
    console.log('signOut error:', e);
  }
};
  return (
    <AuthContext.Provider value={{
      user,
      admin,
      cliente: user && !admin ? user : null,
      loading,
      isAdmin: !!admin,
      isCliente: !!user && !admin,
      isSuperAdmin,
      isResolvingAdmin,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
