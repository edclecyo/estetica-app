import React, { createContext, useContext, useEffect, useState } from 'react';
import { getAuth, onIdTokenChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { getWebApp } from './shims/firebase-core';
import { registrarTokenPush } from '../../../src/services/notificacao.service';

type AuthContextData = {
  user: any | null;
  admin: any | null;
  cliente: any | null;
  loading: boolean;
  isAdmin: boolean;
  isCliente: boolean;
  isSuperAdmin: boolean;
  isResolvingAdmin: boolean;
  signOut: () => Promise<void>;
};

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
  const [user, setUser] = useState<any | null>(null);
  const [admin, setAdmin] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isResolvingAdmin, setIsResolvingAdmin] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    const auth = getAuth(getWebApp());
    const db = getFirestore(getWebApp());
    let alive = true;
    const fallback = window.setTimeout(() => {
      if (!alive) return;
      setLoading(false);
      setIsResolvingAdmin(false);
    }, 3500);

    const unsubscribe = onIdTokenChanged(auth, async firebaseUser => {
      if (!alive) return;
      setLoading(true);
      setIsResolvingAdmin(true);
      try {
        if (!firebaseUser) {
          setUser(null);
          setAdmin(null);
          setIsSuperAdmin(false);
          return;
        }
        setUser(firebaseUser);
        const snap = await getDoc(doc(db, 'admins', firebaseUser.uid));
        if (snap.exists() && snap.data()?.ativo) {
          const dados = { id: firebaseUser.uid, ...snap.data() };
          setAdmin(dados);
          setIsSuperAdmin(dados.cargo === 'Super Admin');
          registrarTokenPush(firebaseUser.uid, 'admin').catch(error => {
            console.log('Erro token push admin web:', error);
          });
        } else {
          setAdmin(null);
          setIsSuperAdmin(false);
          registrarTokenPush(firebaseUser.uid, 'cliente').catch(error => {
            console.log('Erro token push cliente web:', error);
          });
        }
      } catch (error) {
        console.log('Erro auth web:', error);
        setAdmin(null);
        setIsSuperAdmin(false);
      } finally {
        window.clearTimeout(fallback);
        setLoading(false);
        setIsResolvingAdmin(false);
      }
    });

    return () => {
      alive = false;
      window.clearTimeout(fallback);
      unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await firebaseSignOut(getAuth(getWebApp()));
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
