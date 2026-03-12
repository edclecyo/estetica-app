import React, { useEffect } from 'react';
import { AuthProvider } from './src/contexts/AuthContext';
import Navigation from './src/navigation';
import { escutarNotificacoes } from './src/services/notificacaoService';

export default function App() {
  useEffect(() => {
    const unsubscribe = escutarNotificacoes();
    return unsubscribe;
  }, []);

  return (
    <AuthProvider>
      <Navigation />
    </AuthProvider>
  );
}