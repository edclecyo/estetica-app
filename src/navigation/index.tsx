import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, ActivityIndicator } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

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
  const { loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator size="large" color="#C9A96E" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAdmin ? (
          /* ROTAS DO ADMINISTRADOR (Agora incluindo a Home para ele visualizar) */
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
          /* ROTAS DO CLIENTE / PÚBLICAS */
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