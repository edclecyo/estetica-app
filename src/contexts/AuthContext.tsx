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

    // ✅ Foreground — filtra mensagens de avaliação para admin
    const unsubscribeMessaging = messaging().onMessage(async remoteMessage => {
      const titulo = remoteMessage.notification?.title || 'Notificação';
      const corpo = remoteMessage.notification?.body || '';
      const tipo = remoteMessage.data?.tipo || '';

      if (admin && (
        corpo.includes('Avalie') ||
        corpo.includes('avaliação') ||
        tipo === 'concluido' ||
        tipo === 'cancelado'
      )) {
        console.log('Push de cliente ignorado para admin:', titulo);
        return;
      }

      Alert.alert(titulo, corpo);
    });

    return unsubscribeMessaging;
  }, [user, admin]);

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