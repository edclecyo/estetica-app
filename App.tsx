import React, { useEffect } from 'react';
import { AuthProvider } from './src/contexts/AuthContext';
import Navigation from './src/navigation';
import { escutarNotificacoes } from './src/services/notificacao.Service';

export default function App() {
  return (
    <AuthProvider>
      <Navigation />
    </AuthProvider>
  );
}