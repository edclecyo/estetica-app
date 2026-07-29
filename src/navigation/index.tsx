import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, ActivityIndicator, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { configurarAberturaPorNotificacao } from '../services/notificacao.service';

// Telas Cliente
import HomeScreen from '../screens/HomeScreen';
import DetalheScreen from '../screens/DetalheScreen';
import AgendamentosScreen from '../screens/AgendamentosScreen';
import ClienteLoginScreen from '../screens/ClienteLoginScreen';
import AvaliarScreen from '../screens/AvaliarScreen';
import NotificacoesCliente from '../screens/NotificacoesCliente';
import StoryView from '../screens/StoryView';
import PagamentoClienteScreen from '../screens/PagamentoClienteScreen';
import AISimulacaoScreen from '../screens/AISimulacaoScreen';

// Telas Admin
import AdminLoginScreen from '../screens/AdminLoginScreen';
import AdminDashScreen from '../screens/AdminDashScreen';
import AdminEstabScreen from '../screens/AdminEstabScreen';
import AdminNotifScreen from '../screens/AdminNotifScreen';
import PostarStory from '../screens/PostarStory';
import AssinaturaScreen from '../screens/AssinaturaScreen';
import CheckoutPagamentoScreen from '../screens/CheckoutPagamentoScreen';
import CartaoScreen from '../screens/CartaoScreen';
import ContaBancariaScreen from '../screens/ContaBancariaScreen';
import SeloVerificacaoScreen from '../screens/SeloVerificacaoScreen';
import SeloPagamentoScreen from '../screens/SeloPagamentoScreen';
import ImpulsionarScreen from '../screens/ImpulsionarScreen';
import RelatorioFinanceiroScreen from '../screens/RelatorioFinanceiroScreen';
import IADemoScreen from '../screens/IADemoScreen';
import SimulacaoDivulgacaoScreen from '../screens/SimulacaoDivulgacaoScreen';

// Telas Super Admin
import SuperAdminDashScreen from '../screens/SuperAdminDashScreen';
import SuperAdminEstabsScreen from '../screens/SuperAdminEstabsScreen';
import SuperAdminNotifScreen from '../screens/SuperAdminNotifScreen';
import SuperAdminFinanceScreen from '../screens/SuperAdminFinanceScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const isIPhoneWeb = () => {
  const nav = (globalThis as any).navigator;
  if (Platform.OS !== 'web' || !nav) return false;
  const ua = nav.userAgent || '';
  const platform = nav.platform || '';
  return /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && nav.maxTouchPoints > 1);
};

const rotasRaiz = new Set([
  'HomeTabs',
  'AdminDash',
  'SuperAdminDash',
  'AdminLogin',
  'ClienteLogin',
]);

function HomeTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1A1A1A',
          borderTopColor: '#2A2A2A',
          paddingBottom: 8,
          paddingTop: 8,
          height: 64,
        },
        tabBarActiveTintColor: '#C9A96E',
        tabBarInactiveTintColor: '#555',
      }}
      initialRouteName="Home">
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Início',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏠</Text>,
        }}
      />
      <Tab.Screen
        name="Agendamentos"
        component={AgendamentosScreen}
        options={{
          tabBarLabel: 'Meus Horários',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📅</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { loading, isAdmin, isSuperAdmin, isResolvingAdmin } = useAuth();
  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  const [mostrarVoltarWeb, setMostrarVoltarWeb] = useState(false);

  const atualizarVoltarWeb = () => {
    if (!isIPhoneWeb() || !navigationRef.current) {
      setMostrarVoltarWeb(false);
      return;
    }

    const rotaAtual = navigationRef.current.getCurrentRoute()?.name;
    setMostrarVoltarWeb(Boolean(navigationRef.current.canGoBack() && rotaAtual && !rotasRaiz.has(rotaAtual)));
  };

  useEffect(() => {
    configurarAberturaPorNotificacao((data) => {
      if (!navigationRef.current) return;
      switch (data.tela) {
        case 'agendamento':
          navigationRef.current.navigate('Agendamentos');
          break;
        case 'detalhe':
          navigationRef.current.navigate('Detalhe', {
            estabelecimentoId: data.estabelecimentoId,
          });
          break;
        case 'notificacoes':
          navigationRef.current.navigate(
            isAdmin ? 'AdminNotif' : 'NotificacoesCliente'
          );
          break;
        case 'dash':
          if (isSuperAdmin) navigationRef.current.navigate('SuperAdminDash');
          else if (isAdmin) navigationRef.current.navigate('AdminDash');
          break;
        case 'assinatura':
          if (isAdmin) navigationRef.current.navigate('Assinatura');
          break;
        case 'selo':
          if (isAdmin) navigationRef.current.navigate('SeloVerificacaoScreen');
          break;
        case 'impulsionar':
          if (isAdmin) {
            navigationRef.current.navigate('ImpulsionarScreen', {
              estabelecimentoId: data.estabelecimentoId,
            });
          }
          break;
        default:
          break;
      }
    });
  }, [isAdmin, isSuperAdmin]);

  if (loading || isResolvingAdmin) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator size="large" color="#C9A96E" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer
        ref={navigationRef}
        onReady={atualizarVoltarWeb}
        onStateChange={atualizarVoltarWeb}
      >
        <Stack.Navigator screenOptions={{ headerShown: false }}>

        {/* ─── SUPER ADMIN ─── */}
        {isSuperAdmin ? (
          <Stack.Group>
            <Stack.Screen name="SuperAdminDash" component={SuperAdminDashScreen} />
            <Stack.Screen name="SuperAdminEstabs" component={SuperAdminEstabsScreen} />
            <Stack.Screen name="SuperAdminNotif" component={SuperAdminNotifScreen} />
            <Stack.Screen name="SuperAdminFinance" component={SuperAdminFinanceScreen} />
            {/* ✅ Acesso ao login caso precise trocar de conta */}
            <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
          </Stack.Group>

        // ─── ADMIN NORMAL ───
        ) : isAdmin ? (
          <Stack.Group>
            <Stack.Screen name="AdminDash" component={AdminDashScreen} />
            <Stack.Screen name="AdminEstab" component={AdminEstabScreen} />
            <Stack.Screen name="AdminNotif" component={AdminNotifScreen} />
            <Stack.Screen name="PostarStory" component={PostarStory} />
            <Stack.Screen name="StoryView" component={StoryView} />
            <Stack.Screen name="HomeTabs" component={HomeTabs} />
            <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
            <Stack.Screen name="Assinatura" component={AssinaturaScreen} />
			   <Stack.Screen name="CheckoutPagamentoScreen" component={CheckoutPagamentoScreen} />
			   <Stack.Screen name="CartaoScreen" component={CartaoScreen} />
			   <Stack.Screen name="ContaBancariaScreen" component={ContaBancariaScreen} />
			   <Stack.Screen name="SeloVerificacaoScreen" component={SeloVerificacaoScreen}/>
			   <Stack.Screen name="SeloPagamentoScreen" component={SeloPagamentoScreen}/>
			   <Stack.Screen name="ImpulsionarScreen" component={ImpulsionarScreen}/>
			   <Stack.Screen
  name="RelatorioFinanceiroScreen"
  component={RelatorioFinanceiroScreen}
  options={{ headerShown: false }}
/>
<Stack.Screen
  name="IADemoScreen"
  component={IADemoScreen}
  options={{ headerShown: false }}
/>
<Stack.Screen
  name="SimulacaoDivulgacaoScreen"
  component={SimulacaoDivulgacaoScreen}
  options={{ headerShown: false }}
/>
          </Stack.Group>

        // ─── CLIENTE ───
        ) : (
          <Stack.Group>
            <Stack.Screen name="HomeTabs" component={HomeTabs} />
            <Stack.Screen name="Detalhe" component={DetalheScreen} />
            <Stack.Screen name="ClienteLogin" component={ClienteLoginScreen} />
            <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
            <Stack.Screen name="Avaliar" component={AvaliarScreen} />
            <Stack.Screen name="NotificacoesCliente" component={NotificacoesCliente} />
            <Stack.Screen name="StoryView" component={StoryView} />
			<Stack.Screen name="PagamentoCliente" component={PagamentoClienteScreen}/>
			<Stack.Screen
  name="AISimulacaoScreen"
  component={AISimulacaoScreen}
  options={{ headerShown: false }}
/>
          </Stack.Group>
        )}

        </Stack.Navigator>
      </NavigationContainer>

      {mostrarVoltarWeb && (
        <TouchableOpacity
          onPress={() => navigationRef.current?.goBack()}
          style={s.webBackButton}
          activeOpacity={0.86}
        >
          <Text style={s.webBackIcon}>‹</Text>
          <Text style={s.webBackText}>Voltar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  webBackButton: {
    position: 'absolute',
    left: 14,
    bottom: 78,
    zIndex: 9999,
    elevation: 20,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 23,
    backgroundColor: 'rgba(10,10,10,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(201,169,110,0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  webBackIcon: {
    color: '#C9A96E',
    fontSize: 30,
    lineHeight: 32,
    marginRight: 6,
    fontWeight: '800',
  },
  webBackText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
