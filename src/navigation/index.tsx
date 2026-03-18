import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, ActivityIndicator } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

import HomeScreen from '../screens/HomeScreen';
import DetalheScreen from '../screens/DetalheScreen';
import AgendamentosScreen from '../screens/AgendamentosScreen';
import ClienteLoginScreen from '../screens/ClienteLoginScreen';
import AdminLoginScreen from '../screens/AdminLoginScreen';
import AdminDashScreen from '../screens/AdminDashScreen';
import AdminEstabScreen from '../screens/AdminEstabScreen';
import AvaliarScreen from '../screens/AvaliarScreen';
import AdminNotifScreen from '../screens/AdminNotifScreen';
import StoryView from '../screens/StoryView';
import PostarStory from '../screens/PostarStory';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function HomeTabs() {
  const { isCliente, user } = useAuth();
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
          tabBarBadge: undefined,
        }}
      />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' }}>
        <ActivityIndicator size="large" color="#1A1A1A" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
       {isAdmin ? (
  <>
    <Stack.Screen name="AdminDash" component={AdminDashScreen} />
    <Stack.Screen name="AdminEstab" component={AdminEstabScreen} />
    <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
    <Stack.Screen name="AdminNotif" component={AdminNotifScreen} />
  </>
) : (
  <>
  
    <Stack.Screen name="HomeTabs" component={HomeTabs} />
	<Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
    <Stack.Screen name="Detalhe" component={DetalheScreen} />
    <Stack.Screen name="ClienteLogin" component={ClienteLoginScreen} />
    <Stack.Screen name="Avaliar" component={AvaliarScreen} />
    <Stack.Screen name="AdminDash" component={AdminDashScreen} />
    <Stack.Screen name="AdminEstab" component={AdminEstabScreen} />
	<Stack.Screen
name="StoryView"
component={StoryView}
options={{ headerShown:false }}
/>
<Stack.Screen
name="PostarStory"
component={PostarStory}
/>
  </>
)}
      </Stack.Navigator>
    </NavigationContainer>
  );
}