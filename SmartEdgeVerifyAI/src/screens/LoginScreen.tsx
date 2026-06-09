/**
 * LoginScreen.tsx
 *
 * Provides a login screen where users enter their Employee ID.
 * Features a modern, glassmorphism UI with rapid testing shortcut buttons.
 */

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  StatusBar
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { EmployeeDAO } from '../database/EmployeeDAO';
import { NetworkService } from '../services/NetworkService';
import { SyncService } from '../services/SyncService';

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

interface Props {
  navigation: LoginScreenNavigationProp;
}

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const [employeeId, setEmployeeId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(NetworkService.isOnline());
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    // Check network status initially
    setIsOnline(NetworkService.isOnline());
    setPendingCount(SyncService.getPendingSyncCount().total);

    // Subscribe to network changes
    const unsubscribeNetwork = NetworkService.subscribe((online) => {
      setIsOnline(online);
    });

    // Subscribe to sync queue changes (which happen when background tasks run)
    const unsubscribeSync = SyncService.subscribe(() => {
      setPendingCount(SyncService.getPendingSyncCount().total);
    });

    // Poll pending counts occasionally
    const interval = setInterval(() => {
      setPendingCount(SyncService.getPendingSyncCount().total);
    }, 3000);

    return () => {
      unsubscribeNetwork();
      unsubscribeSync();
      clearInterval(interval);
    };
  }, []);

  const handleLogin = () => {
    setError(null);
    const id = employeeId.trim().toUpperCase();

    if (!id) {
      setError('Please enter your Employee ID');
      return;
    }

    const employee = EmployeeDAO.getEmployeeById(id);
    if (!employee) {
      setError('Invalid Employee ID. Try EMP-001 or EMP-7392');
      return;
    }

    Keyboard.dismiss();
    // Navigate to Face Verification
    navigation.navigate('FaceVerification', { employeeId: id });
  };

  const selectTestEmployee = (id: string) => {
    setEmployeeId(id);
    setError(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardContainer}
        >
          <View style={styles.innerContainer}>
            {/* Header / Logo Area (Long-press logo section for Debug screen) */}
            <TouchableOpacity
              activeOpacity={1}
              onLongPress={() => navigation.navigate('Debug')}
              style={styles.logoSection}
            >
              <View style={styles.logoCircle}>
                <Text style={styles.logoText}>SE</Text>
              </View>
              <Text style={styles.title}>SmartEdge Verify</Text>
              <Text style={styles.subtitle}>Datalake 3.0 Field Authentication</Text>
            </TouchableOpacity>

            {/* Main Login Card */}
            <GlassCard style={styles.card}>
              <Text style={styles.cardHeader}>AUTHENTICATE PERSONNEL</Text>
              
              <TextInput
                style={[styles.input, error ? styles.inputError : null]}
                placeholder="Enter Employee ID"
                placeholderTextColor="#64748B"
                value={employeeId}
                onChangeText={(txt) => {
                  setEmployeeId(txt);
                  setError(null);
                }}
                autoCapitalize="characters"
                autoCorrect={false}
              />

              {error && <Text style={styles.errorText}>{error}</Text>}

              <GradientButton
                title="Start Verification"
                onPress={handleLogin}
                style={styles.button}
              />
            </GlassCard>

            {/* Quick Select Panel for Testing */}
            <GlassCard style={styles.shortcutsCard}>
              <Text style={styles.shortcutsHeader}>TESTING PRE-SETS (DEMO)</Text>
              <View style={styles.presetRow}>
                <TouchableOpacity
                  style={[styles.presetBtn, employeeId === 'EMP-001' && styles.presetBtnActive]}
                  onPress={() => selectTestEmployee('EMP-001')}
                >
                  <Text style={styles.presetBtnText}>Rahul Kumar (EMP-001)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.presetBtn, employeeId === 'EMP-7392' && styles.presetBtnActive]}
                  onPress={() => selectTestEmployee('EMP-7392')}
                >
                  <Text style={styles.presetBtnText}>Rajesh Kumar (EMP-7392)</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>

            {/* Bottom Status / Utility Links */}
            <View style={styles.bottomSection}>
              <View style={styles.networkIndicator}>
                <View style={[styles.networkDot, isOnline ? styles.onlineDot : styles.offlineDot]} />
                <Text style={styles.networkText}>
                  {isOnline ? 'NETWORK ONLINE' : 'OFFLINE MODE'}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => navigation.navigate('Sync')}
                style={styles.syncLink}
              >
                <Text style={styles.syncLinkText}>
                  Sync Control Center ({pendingCount} pending)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A', // Deep dark slate background
  },
  keyboardContainer: {
    flex: 1,
  },
  innerContainer: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 4,
    fontWeight: '600',
  },
  card: {
    width: '100%',
    marginBottom: 20,
  },
  cardHeader: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: '#334155',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 16,
    marginTop: -8,
  },
  button: {
    marginTop: 8,
  },
  shortcutsCard: {
    padding: 16,
    marginBottom: 30,
  },
  shortcutsHeader: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 12,
  },
  presetRow: {
    gap: 8,
  },
  presetBtn: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  presetBtnActive: {
    borderColor: '#6366F1',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  presetBtnText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  bottomSection: {
    alignItems: 'center',
    gap: 12,
  },
  networkIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  networkDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  onlineDot: {
    backgroundColor: '#06B6D4',
  },
  offlineDot: {
    backgroundColor: '#EF4444',
  },
  networkText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  syncLink: {
    paddingVertical: 4,
  },
  syncLinkText: {
    color: '#6366F1',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
