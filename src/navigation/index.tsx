import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View, Text } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import type { RootStackParamList } from '../types';

// Screens
import HomeScreen from '../screens/HomeScreen';
import DetalheScreen from '../screens/DetalheScreen';
import AgendamentosScreen from '../screens/AgendamentosScreen';
import AdminLoginScreen from '../screens/AdminLoginScreen';
import AdminDashScreen from '../screens/AdminDashScreen';
import AdminEstabScreen from '../screens/AdminEstabScreen';

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function ClienteTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#F0EBE6' },
        tabBarActiveTintColor: '#1A1A1A',
        tabBarInactiveTintColor: '#aaa',
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: '🏠 Início' }}
      />
      <Tab.Screen
        name="Agendamentos"
        component={AgendamentosScreen}
        options={{ tabBarLabel: '📋 Agendados' }}
      />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAF7F4' }}>
        <ActivityIndicator size="large" color="#C9A96E" />
        <Text style={{ marginTop: 12, color: '#888', fontFamily: 'serif' }}>Carregando...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={ClienteTabs} />
        <Stack.Screen name="Detalhe" component={DetalheScreen} />
        <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
        <Stack.Screen name="AdminDash" component={AdminDashScreen} />
        <Stack.Screen name="AdminEstab" component={AdminEstabScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}