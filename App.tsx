import React, { useEffect } from 'react';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/contexts/AuthContext';
import Navigation from './src/navigation';
import {
  registrarTokenPush,
  escutarNotificacoes,
} from './src/services/notificacao.service';

export default function App() {
  useEffect(() => {
    const unsubscribeForeground = escutarNotificacoes();

    const unsubscribeAuth = auth().onAuthStateChanged(async user => {
      if (!user?.uid) return;

      try {
        const adminSnap = await firestore()
          .collection('admins')
          .doc(user.uid)
          .get();

        const tipo = adminSnap.exists && adminSnap.data()?.ativo
          ? 'admin'
          : 'cliente';

        await registrarTokenPush(user.uid, tipo);
      } catch (e) {
        console.log('Erro ao inicializar push:', e);
      }
    });

    return () => {
      unsubscribeForeground?.();
      unsubscribeAuth();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Navigation />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
