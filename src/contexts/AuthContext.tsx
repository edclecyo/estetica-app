import React, { createContext, useContext, useEffect, useState } from 'react';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import messaging from '@react-native-firebase/messaging';
import { Alert } from 'react-native';
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
    const unsubscribe = auth().onAuthStateChanged(async firebaseUser => {
      setUser(firebaseUser);
      setIsResolvingAdmin(true);

      if (firebaseUser) {
        try {
          const snap = await firestore()
            .collection('admins')
            .doc(firebaseUser.uid)
            .get();

          if (snap.exists && snap.data()?.ativo) {
            const dados = snap.data()!;
            setAdmin({ id: firebaseUser.uid, ...dados } as Admin);
            // ✅ isSuperAdmin definido como estado separado
            setIsSuperAdmin(dados.cargo === 'Super Admin');
          } else {
            setAdmin(null);
            setIsSuperAdmin(false);
          }
        } catch (e) {
          console.log('Erro ao buscar admin:', e);
          setAdmin(null);
          setIsSuperAdmin(false);
        }
      } else {
        setAdmin(null);
        setIsSuperAdmin(false);
      }

      setLoading(false);
      setIsResolvingAdmin(false);
    });

    return unsubscribe;
  }, []);

  // --- LOGOUT ---
  const signOut = async () => {
    if (user && admin) {
      try {
        await messaging().unsubscribeFromTopic(`admin_${user.uid}`);
      } catch (e) {
        console.log('Erro ao desinscrever do tópico:', e);
      }
    }
    try {
      await auth().signOut();
    } catch (e) {
      console.log('signOut error:', e);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      admin,
      cliente: admin ? null : user,
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