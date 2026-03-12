import React, { createContext, useContext, useEffect, useState } from 'react';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import type { Admin } from '../types';

interface AuthContextData {
  user: FirebaseAuthTypes.User | null;
  admin: Admin | null;
  cliente: FirebaseAuthTypes.User | null;
  loading: boolean;
  isAdmin: boolean;
  isCliente: boolean;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(async firebaseUser => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // Verifica se é admin
        try {
          const snap = await firestore()
            .collection('admins')
            .doc(firebaseUser.uid)
            .get();
          if (snap.exists && snap.data()?.ativo) {
            setAdmin({ id: firebaseUser.uid, ...snap.data() } as Admin);
          } else {
            setAdmin(null);
          }
        } catch {
          setAdmin(null);
        }
      } else {
        setAdmin(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      admin,
      cliente: admin ? null : user, // se não é admin, é cliente
      loading,
      isAdmin: !!admin,
      isCliente: !!user && !admin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}