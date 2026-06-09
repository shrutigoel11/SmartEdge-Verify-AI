/**
 * AppNavigator.tsx
 *
 * Configures the navigation stack using React Navigation 7.
 * Includes routes: Login, FaceVerification, Dashboard, Sync, Debug.
 */

import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';

import { LoginScreen } from '../screens/LoginScreen';
import { FaceVerificationScreen } from '../screens/FaceVerificationScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { SyncScreen } from '../screens/SyncScreen';
import { DebugScreen } from '../screens/DebugScreen';

export type RootStackParamList = {
  Login: undefined;
  FaceVerification: { employeeId: string };
  Dashboard: { employeeId: string };
  Sync: undefined;
  Debug: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: '#0F172A' }, // Deep slate background
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="FaceVerification" component={FaceVerificationScreen} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen name="Sync" component={SyncScreen} />
        <Stack.Screen name="Debug" component={DebugScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
