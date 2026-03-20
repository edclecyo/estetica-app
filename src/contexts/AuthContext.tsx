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
  isResolvingAdmin: boolean; // ✅ Adicionado
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);
  const [isResolvingAdmin, setIsResolvingAdmin] = useState(true); // ✅ Começa true

  // --- LÓGICA DE NOTIFICAÇÕES ---
  useEffect(() => {
    if (!user) return;

    const configurarNotificacoes = async () => {
      try {
        // 1. Pedir permissão (Essencial para iOS)
        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (enabled) {
          // 2. Obter o Token do dispositivo
          const token = await messaging().getToken();
          
          if (token) {
            // 3. Salvar o token no documento do usuário
            const colecao = admin ? 'admins' : 'clientes';
            await firestore()
              .collection(colecao)
              .doc(user.uid)
              .set({ fcmToken: token, ultimoAcesso: new Date() }, { merge: true });

            // 4. Se for Admin, inscreve no tópico para alertas de reputação
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

    // 5. Ouvir notificações com o App aberto (Foreground)
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
      setUser(firebaseUser);
      setIsResolvingAdmin(true); // ✅ Inicia resolução

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
      setIsResolvingAdmin(false); // ✅ Resolvido
    });

    return unsubscribe;
  }, []);

  // Logout centralizado — reseta admin imediatamente
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
      isResolvingAdmin, // ✅ Novo campo exportado
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}