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
  isResolvingAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);
  const [isResolvingAdmin, setIsResolvingAdmin] = useState(true);

  // --- LÓGICA DE NOTIFICAÇÕES ---
  useEffect(() => {
    if (!user) return;

    const configurarNotificacoes = async () => {
      try {
        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (enabled) {
          const token = await messaging().getToken();
          
          if (token) {
            const colecao = admin ? 'admins' : 'clientes';
            await firestore()
              .collection(colecao)
              .doc(user.uid)
              .set({ fcmToken: token, ultimoAcesso: new Date() }, { merge: true });

            if (admin) {
              await messaging().subscribeToTopic(`admin_${user.uid}`);
            }
          }
        }
      } catch (error) {
        console.log('Erro ao configurar notificações:', error);
      }
    };

    configurarNotificacoes();

    const unsubscribeMessaging = messaging().onMessage(async remoteMessage => {
      Alert.alert(
        remoteMessage.notification?.title || 'Notificação',
        remoteMessage.notification?.body
      );
    });

    return unsubscribeMessaging;
  }, [user, admin]);

  // --- MONITORAMENTO DE AUTH ---
  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(async firebaseUser => {
      setIsResolvingAdmin(true);
      setUser(firebaseUser);

      if (firebaseUser) {
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
        } catch (e) {
          console.log("Erro ao buscar admin:", e);
          setAdmin(null);
        }
      } else {
        setAdmin(null);
      }

      setLoading(false);
      setIsResolvingAdmin(false);
    });

    return unsubscribe;
  }, []);

  const signOut = async () => {
    if (user && admin) {
      try {
        await messaging().unsubscribeFromTopic(`admin_${user.uid}`);
      } catch (e) {
        console.log('Erro ao desinscrever do tópico:', e);
      }
    }
    
    setAdmin(null);
    setUser(null);
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
      isResolvingAdmin,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook com trava de segurança para evitar erro de "useContext of null"
export function useAuth() {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }

  return context;
}