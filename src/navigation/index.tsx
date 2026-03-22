import React, { useEffect, useRef } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, ActivityIndicator } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { configurarAberturaPorNotificacao } from '../services/notificacaoService';

// Telas Cliente
import HomeScreen from '../screens/HomeScreen';
import DetalheScreen from '../screens/DetalheScreen';
import AgendamentosScreen from '../screens/AgendamentosScreen';
import ClienteLoginScreen from '../screens/ClienteLoginScreen';
import AvaliarScreen from '../screens/AvaliarScreen';
import NotificacoesCliente from '../screens/NotificacoesCliente';
import SetupSuperAdminScreen from '../screens/SetupSuperAdminScreen';
import StoryView from '../screens/StoryView';

// Telas Admin
import AdminLoginScreen from '../screens/AdminLoginScreen';
import AdminDashScreen from '../screens/AdminDashScreen';
import AdminEstabScreen from '../screens/AdminEstabScreen';
import AdminNotifScreen from '../screens/AdminNotifScreen';
import PostarStory from '../screens/PostarStory';
import AssinaturaScreen from '../screens/AssinaturaScreen';

// Telas Super Admin
import SuperAdminDashScreen from '../screens/SuperAdminDashScreen';
import SuperAdminEstabsScreen from '../screens/SuperAdminEstabsScreen';
import SuperAdminNotifScreen from '../screens/SuperAdminNotifScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

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
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>

        {/* ─── SUPER ADMIN ─── */}
        {isSuperAdmin ? (
          <Stack.Group>
            <Stack.Screen name="SuperAdminDash" component={SuperAdminDashScreen} />
            <Stack.Screen name="SuperAdminEstabs" component={SuperAdminEstabsScreen} />
            <Stack.Screen name="SuperAdminNotif" component={SuperAdminNotifScreen} />
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
			<Stack.Screen name="SetupSuperAdmin" component={SetupSuperAdminScreen} />
          </Stack.Group>
        )}

      </Stack.Navigator>
    </NavigationContainer>
  );
}