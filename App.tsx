import React, { useEffect } from 'react';
import { AuthProvider } from './src/contexts/AuthContext';
import Navigation from './src/navigation';

import {
  registrarTokenPush,
  escutarNotificacoes,
  configurarAberturaPorNotificacao
} from './src/services/notificacao.service';

export default function App() {

  useEffect(() => {
    initPush();
  }, []);

  async function initPush() {
    const uid = "USER_ID_AQUI"; // 🔥 pega do auth depois
    const tipo = "cliente";     // ou admin

    await registrarTokenPush(uid, tipo);

    escutarNotificacoes();

    configurarAberturaPorNotificacao((data) => {
      console.log('Abriu notificação:', data);

      // 👉 aqui você navega
      // navigationRef.navigate(...)
    });
  }

  return (
    <AuthProvider>
      <Navigation />
    </AuthProvider>
  );
}