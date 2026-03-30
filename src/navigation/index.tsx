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
import StoryView from '../screens/StoryView';
// Telas Admin
import AdminLoginScreen from '../screens/AdminLoginScreen';
import AdminDashScreen from '../screens/AdminDashScreen';
import AdminEstabScreen from '../screens/AdminEstabScreen';
import AdminNotifScreen from '../screens/AdminNotifScreen';
import PostarStory from '../screens/PostarStory';

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
  const { loading, isAdmin, isResolvingAdmin } = useAuth();

  // ✅ Ref para navegar de fora do contexto de navegação (ex: notificação)
  const navigationRef = useRef<NavigationContainerRef<any>>(null);

  // ✅ Configura navegação ao tocar em notificação push
  useEffect(() => {
    configurarAberturaPorNotificacao((data) => {
      if (!navigationRef.current) return;

      // Navega com base nos dados enviados no payload da notificação
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
          if (isAdmin) navigationRef.current.navigate('AdminDash');
          break;
        default:
          // Sem tela definida no payload — não navega
          break;
      }
    });
  }, [isAdmin]);

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
        {isAdmin ? (
          <>
            <Stack.Screen name="AdminDash" component={AdminDashScreen} />
            <Stack.Screen name="HomeTabs" component={HomeTabs} />
            <Stack.Screen name="AdminEstab" component={AdminEstabScreen} />
            <Stack.Screen name="AdminNotif" component={AdminNotifScreen} />
            <Stack.Screen name="PostarStory" component={PostarStory} />
            <Stack.Screen name="StoryView" component={StoryView} />
            <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="HomeTabs" component={HomeTabs} />
            <Stack.Screen name="Detalhe" component={DetalheScreen} />
            <Stack.Screen name="ClienteLogin" component={ClienteLoginScreen} />
            <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
            <Stack.Screen name="Avaliar" component={AvaliarScreen} />
            <Stack.Screen name="NotificacoesCliente" component={NotificacoesCliente} />
            <Stack.Screen name="StoryView" component={StoryView} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}