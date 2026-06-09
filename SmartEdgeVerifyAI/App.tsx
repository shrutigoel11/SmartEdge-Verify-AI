/**
 * App.tsx
 *
 * Main entry point of the SmartEdgeVerifyAI application.
 * Initializes SQLite databases, seeds default demo operators,
 * boots network monitors, registers background services, and renders the stack navigation.
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // recommended for react-navigation

// Register the background task at the very top of execution
import './src/services/BackgroundGPS';

import { AppNavigator } from './src/navigation/AppNavigator';
import { SQLiteClient } from './src/database/SQLiteClient';
import { EmployeeDAO } from './src/database/EmployeeDAO';
import { NetworkService } from './src/services/NetworkService';
import { SyncService } from './src/services/SyncService';
import { LocationService } from './src/services/LocationService';
import { BackgroundGPS } from './src/services/BackgroundGPS';
import { ConfigUtil } from './src/utils/ConfigUtil';

export default function App() {
  const [initialized, setInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    async function bootstrap() {
      try {
        console.log('[App] Starting SmartEdgeVerifyAI bootstrap...');
        
        // 0. Load custom server IP endpoints
        await ConfigUtil.init();
        console.log('[App] Server configuration cached.');

        // 1. Initialize local SQLite Database & Run Migrations
        // Simply calling getDb() executes schema creation synchronously
        const db = SQLiteClient.getDb();
        console.log('[App] SQLite Client initialized.');

        // 2. Seed mock employee profiles if empty
        EmployeeDAO.seedMockEmployees();
        console.log('[App] Employee database seeded.');

        // 3. Initialize real-time network connectivity monitor
        NetworkService.init();
        console.log('[App] Network monitor active.');

        // 4. Initialize auto synchronization service
        SyncService.init();
        console.log('[App] Auto synchronization service active.');

        // 5. Request GPS permissions and start background logging
        console.log('[App] Requesting location permissions...');
        const permissionsGranted = await LocationService.requestPermissions();
        if (permissionsGranted) {
          console.log('[App] Location permissions verified. Initializing background GPS task...');
          const trackingStarted = await BackgroundGPS.startTracking();
          if (trackingStarted) {
            console.log('[App] Background GPS task running successfully.');
          } else {
            console.warn('[App] Background GPS task failed to start.');
          }
        } else {
          console.warn('[App] Location permissions denied. Background tracking disabled.');
        }

        setInitialized(true);
      } catch (error: any) {
        console.error('[App] Bootstrap failure:', error);
        setInitError(error.message || 'SQLite initialization database error');
      }
    }

    bootstrap();
  }, []);

  if (initError) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>SYSTEM DATABASE ERROR</Text>
          <Text style={styles.errorText}>{initError}</Text>
          <Text style={styles.errorHint}>Please reinstall the application or clear app cache storage.</Text>
        </View>
      </View>
    );
  }

  if (!initialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>INITIALIZING SMARTEDGE SECURE DATABASE...</Text>
      </View>
    );
  }

  // Wrapped in GestureHandlerRootView to support gesture navigation on Android
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <AppNavigator />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 18,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    padding: 24,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  errorTitle: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
  },
  errorText: {
    color: '#E2E8F0',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  errorHint: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});
