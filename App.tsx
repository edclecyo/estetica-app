import React from 'react';
import { AuthProvider } from './src/contexts/AuthContext';
import Navigation from './src/navigation';

// ✅ Removido escutarNotificacoes() — AuthContext já cuida do foreground com filtro de admin
export default function App() {
  return (
    <AuthProvider>
      <Navigation />
    </AuthProvider>
  );
}