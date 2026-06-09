/**
 * DebugScreen.tsx
 *
 * A hidden developer dashboard screen for demonstrations and diagnostics.
 * Displays contents of all database tables (attendance, GPS, verification, and audit logs).
 * Provides controls to change server IP, inject mock logs, and reset databases.
 */

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StatusBar
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';

import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';

import { SQLiteClient } from '../database/SQLiteClient';
import { AttendanceDAO, AttendanceLog } from '../database/AttendanceDAO';
import { GPSLogsDAO, GPSLog } from '../database/GPSLogsDAO';
import { VerificationDAO, VerificationLog } from '../database/VerificationDAO';
import { SyncAuditLogsDAO, SyncAuditLog } from '../database/SyncAuditLogsDAO';
import { EmployeeDAO } from '../database/EmployeeDAO';

import { ConfigUtil } from '../utils/ConfigUtil';
import { BackupService } from '../services/BackupService';
import { SyncService } from '../services/SyncService';

type DebugScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Debug'>;

interface Props {
  navigation: DebugScreenNavigationProp;
}

export const DebugScreen: React.FC<Props> = ({ navigation }) => {
  const [serverUrl, setServerUrl] = useState(ConfigUtil.getApiBaseUrl());
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [gpsLogs, setGpsLogs] = useState<GPSLog[]>([]);
  const [verificationLogs, setVerificationLogs] = useState<VerificationLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<SyncAuditLog[]>([]);

  // Stats state
  const [dbRecordCount, setDbRecordCount] = useState(0);
  const [backupInfo, setBackupInfo] = useState<{ exists: boolean; size?: number; uri?: string }>({ exists: false });
  
  // Console logging state
  const [syncing, setSyncing] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);

  useEffect(() => {
    refreshData();

    // Subscribe to SyncService notifications
    const unsubscribeSync = SyncService.subscribe((msg) => {
      setConsoleLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
      refreshData();
    });

    return () => {
      unsubscribeSync();
    };
  }, []);

  const refreshData = async () => {
    try {
      setAttendanceLogs(AttendanceDAO.getAllLogs());
      setGpsLogs(GPSLogsDAO.getAllLogs());
      setVerificationLogs(VerificationDAO.getAllLogs());
      setAuditLogs(SyncAuditLogsDAO.getAllAudits());

      // Count all database records
      const db = SQLiteClient.getDb();
      let total = 0;
      
      const attCount = db.getFirstSync<any>('SELECT COUNT(*) as count FROM attendance_logs;')?.count || 0;
      const gpsCount = db.getFirstSync<any>('SELECT COUNT(*) as count FROM gps_logs;')?.count || 0;
      const verCount = db.getFirstSync<any>('SELECT COUNT(*) as count FROM verification_logs;')?.count || 0;
      const audCount = db.getFirstSync<any>('SELECT COUNT(*) as count FROM sync_audit_logs;')?.count || 0;
      const empCount = db.getFirstSync<any>('SELECT COUNT(*) as count FROM employees;')?.count || 0;
      
      total = attCount + gpsCount + verCount + audCount + empCount;
      setDbRecordCount(total);

      // Fetch backup status
      const backup = await BackupService.getBackupInfo();
      setBackupInfo(backup);
    } catch (e) {
      console.error('Failed to load debug table lists:', e);
    }
  };

  const handleSaveUrl = async () => {
    try {
      await ConfigUtil.saveApiBaseUrl(serverUrl);
      Alert.alert('Configuration Saved', `Target server API URL updated to:\n${ConfigUtil.getApiBaseUrl()}`);
    } catch (error) {
      Alert.alert('Configuration Error', 'Could not save the specified URL.');
    }
  };

  const handleInjectMockData = () => {
    try {
      // 1. Inject an unsynced attendance record (Mark IN) for Rahul Kumar
      const now = new Date();
      // Inject directly using AttendanceDAO.markIN
      AttendanceDAO.markIN('EMP-001', 28.6139, 77.2090);

      // 2. Inject an unsynced GPS record
      GPSLogsDAO.insertGPSLog(28.6145, 77.2110);

      // 3. Inject an unsynced biometric verification record
      VerificationDAO.insertVerificationLog(
        'EMP-001',
        0.9845,
        true,
        Array.from({ length: 128 }, () => Math.random() - 0.5)
      );

      Alert.alert('Mock Data Injected', 'Inserted 1 Attendance, 1 GPS, and 1 Biometric Verification unsynced records.');
      refreshData();
    } catch (e) {
      Alert.alert('Injection Failure', 'Failed to insert mock SQLite logs.');
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setConsoleLogs([`[${new Date().toLocaleTimeString()}] Initiating manual synchronization...`]);

    try {
      const report = await SyncService.syncAll();
      setConsoleLogs(report.logs);
      Alert.alert('Sync Executed', `Attendance: ${report.attendanceSyncedCount} synced\nGPS: ${report.gpsSyncedCount} synced\nBiometric Purges: ${report.verificationPurgedCount}`);
    } catch (error: any) {
      setConsoleLogs((prev) => [...prev, `[Error] ${error.message || error}`]);
      Alert.alert('Sync Failure', 'Synchronization sequence interrupted.');
    } finally {
      setSyncing(false);
      refreshData();
    }
  };

  const handleWipeDatabase = () => {
    Alert.alert(
      'Wipe SQLite Database',
      'This will delete all tables (logs, sync audits, and employee records) and re-seed the defaults. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'WIPE ALL',
          style: 'destructive',
          onPress: () => {
            try {
              SQLiteClient.clearAllTables();
              SyncAuditLogsDAO.clearAudits();
              EmployeeDAO.seedMockEmployees();
              Alert.alert('Database Sanitized', 'All logs cleared and employee records re-seeded.');
              refreshData();
            } catch (e) {
              Alert.alert('Reset Failed', 'Failed to wipe database.');
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Close</Text>
        </TouchableOpacity>
        <Text style={styles.title}>System Debug Console</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* API Endpoint Config Card */}
        <GlassCard style={styles.card}>
          <Text style={styles.cardHeader}>TARGET SERVER IP CONFIGURATION</Text>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="http://192.168.1.100:5000"
            placeholderTextColor="#475569"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <GradientButton title="Save Server URL" onPress={handleSaveUrl} />
        </GlassCard>

        {/* Diagnostic Actions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>DIAGNOSTIC CONTROLS</Text>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.controlBtn, styles.injectBtn]} onPress={handleInjectMockData}>
            <Text style={styles.injectBtnText}>Inject Unsynced Logs</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.controlBtn, styles.syncBtn, syncing && styles.btnDisabled]} 
            onPress={handleManualSync}
            disabled={syncing}
          >
            <Text style={styles.syncBtnText}>Trigger Sync</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.wipeBtn} onPress={handleWipeDatabase}>
          <Text style={styles.wipeBtnText}>Wipe Database & Re-seed Defaults</Text>
        </TouchableOpacity>

        {/* Console Logs */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>LIVE TERMINAL CONSOLE</Text>
        </View>
        <View style={styles.consoleWrapper}>
          <ScrollView style={styles.consoleScroll} nestedScrollEnabled={true}>
            {consoleLogs.length === 0 ? (
              <Text style={styles.consolePlaceholder}>Console ready. Perform sync or operations...</Text>
            ) : (
              consoleLogs.map((log, index) => (
                <Text key={index} style={styles.consoleLog}>{log}</Text>
              ))
            )}
          </ScrollView>
        </View>

        {/* Database & File Stats */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>FILES & DATABASE STATS</Text>
        </View>
        <GlassCard style={styles.card}>
          <Text style={styles.statLine}>Total SQLite Record Count: <Text style={styles.highlightText}>{dbRecordCount}</Text></Text>
          <Text style={styles.statLine}>Backup Exists: <Text style={styles.highlightText}>{backupInfo.exists ? 'YES' : 'NO'}</Text></Text>
          {backupInfo.exists && (
            <>
              <Text style={styles.statLine}>Backup Size: <Text style={styles.highlightText}>{(backupInfo.size ? backupInfo.size / 1024 : 0).toFixed(2)} KB</Text></Text>
              <Text style={styles.statLine}>Backup URI: <Text style={styles.uriText}>{backupInfo.uri}</Text></Text>
            </>
          )}
        </GlassCard>

        {/* SQLite Table Inspectors */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>SQLITE TABLE AUDITS</Text>
        </View>

        {/* Attendance Table */}
        <Text style={styles.tableLabel}>attendance_logs ({attendanceLogs.length} rows)</Text>
        <ScrollView horizontal={true} style={styles.tableScroll}>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeaderRow]}>
              <Text style={[styles.cell, styles.cellHeader]}>Emp ID</Text>
              <Text style={[styles.cell, styles.cellHeader]}>Date</Text>
              <Text style={[styles.cell, styles.cellHeader]}>IN</Text>
              <Text style={[styles.cell, styles.cellHeader]}>OUT</Text>
              <Text style={[styles.cell, styles.cellHeader]}>Hours</Text>
              <Text style={[styles.cell, styles.cellHeader]}>Sync</Text>
              <Text style={[styles.cell, styles.cellHeader]}>Retries</Text>
            </View>
            {attendanceLogs.length === 0 ? (
              <Text style={styles.noRowsText}>No logs found.</Text>
            ) : (
              attendanceLogs.map((row) => (
                <View key={row.id} style={styles.tableRow}>
                  <Text style={styles.cell}>{row.employee_id}</Text>
                  <Text style={styles.cell}>{row.date}</Text>
                  <Text style={styles.cell}>{row.in_time}</Text>
                  <Text style={styles.cell}>{row.out_time || '--'}</Text>
                  <Text style={styles.cell}>{row.working_hours || '--'}</Text>
                  <Text style={[styles.cell, row.sync_status === 1 ? styles.textSynced : styles.textPending]}>
                    {row.sync_status === 1 ? 'Synced' : 'Pending'}
                  </Text>
                  <Text style={styles.cell}>{row.retry_count}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {/* GPS Logs Table */}
        <Text style={styles.tableLabel}>gps_logs ({gpsLogs.length} rows)</Text>
        <ScrollView horizontal={true} style={styles.tableScroll}>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeaderRow]}>
              <Text style={[styles.cell, styles.cellHeader]}>Timestamp</Text>
              <Text style={[styles.cell, styles.cellHeader]}>Latitude</Text>
              <Text style={[styles.cell, styles.cellHeader]}>Longitude</Text>
              <Text style={[styles.cell, styles.cellHeader]}>Sync</Text>
              <Text style={[styles.cell, styles.cellHeader]}>Retries</Text>
            </View>
            {gpsLogs.length === 0 ? (
              <Text style={styles.noRowsText}>No logs found.</Text>
            ) : (
              gpsLogs.map((row) => (
                <View key={row.id} style={styles.tableRow}>
                  <Text style={styles.cell}>{new Date(row.timestamp).toLocaleTimeString()}</Text>
                  <Text style={styles.cell}>{row.latitude.toFixed(5)}</Text>
                  <Text style={styles.cell}>{row.longitude.toFixed(5)}</Text>
                  <Text style={[styles.cell, row.sync_status === 1 ? styles.textSynced : styles.textPending]}>
                    {row.sync_status === 1 ? 'Synced' : 'Pending'}
                  </Text>
                  <Text style={styles.cell}>{row.retry_count}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {/* Verification Logs Table */}
        <Text style={styles.tableLabel}>verification_logs ({verificationLogs.length} rows)</Text>
        <ScrollView horizontal={true} style={styles.tableScroll}>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeaderRow]}>
              <Text style={[styles.cell, styles.cellHeader]}>Emp ID</Text>
              <Text style={[styles.cell, styles.cellHeader]}>Confidence</Text>
              <Text style={[styles.cell, styles.cellHeader]}>Liveness</Text>
              <Text style={[styles.cell, styles.cellHeader]}>Synced</Text>
              <Text style={[styles.cell, styles.cellHeader, { width: 140 }]}>Embedding Cache</Text>
            </View>
            {verificationLogs.length === 0 ? (
              <Text style={styles.noRowsText}>No logs found.</Text>
            ) : (
              verificationLogs.map((row) => (
                <View key={row.id} style={styles.tableRow}>
                  <Text style={styles.cell}>{row.employee_id}</Text>
                  <Text style={styles.cell}>{row.confidence.toFixed(4)}</Text>
                  <Text style={styles.cell}>{row.liveness_pass === 1 ? 'PASS' : 'FAIL'}</Text>
                  <Text style={[styles.cell, row.synced === 1 ? styles.textSynced : styles.textPending]}>
                    {row.synced === 1 ? 'Synced' : 'Pending'}
                  </Text>
                  <Text style={[styles.cell, { width: 140 }, row.face_embedding_cache ? styles.embeddingActive : styles.embeddingPurged]}>
                    {row.face_embedding_cache ? 'Cached (Active)' : 'Zero-Fill Purged'}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {/* Sync Audit Logs Table */}
        <Text style={styles.tableLabel}>sync_audit_logs ({auditLogs.length} rows)</Text>
        <ScrollView horizontal={true} style={styles.tableScroll}>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeaderRow]}>
              <Text style={[styles.cell, styles.cellHeader]}>Type</Text>
              <Text style={[styles.cell, styles.cellHeader]}>Record ID</Text>
              <Text style={[styles.cell, styles.cellHeader]}>Attempt</Text>
              <Text style={[styles.cell, styles.cellHeader]}>Status</Text>
              <Text style={[styles.cell, styles.cellHeader]}>HTTP Code</Text>
              <Text style={[styles.cell, styles.cellHeader, { width: 120 }]}>Timestamp</Text>
            </View>
            {auditLogs.length === 0 ? (
              <Text style={styles.noRowsText}>No audits logged.</Text>
            ) : (
              auditLogs.map((row) => (
                <View key={row.id} style={styles.tableRow}>
                  <Text style={styles.cell}>{row.record_type.toUpperCase()}</Text>
                  <Text style={styles.cell}>{row.record_id.substring(0, 8)}...</Text>
                  <Text style={styles.cell}>{row.attempt_count}</Text>
                  <Text style={[styles.cell, row.status === 'SUCCESS' ? styles.textSynced : styles.textPending]}>
                    {row.status}
                  </Text>
                  <Text style={styles.cell}>{row.response_code || '--'}</Text>
                  <Text style={[styles.cell, { width: 120 }]}>{new Date(row.timestamp).toLocaleTimeString()}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        <View style={styles.extraSpacing} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: StatusBar.currentHeight || 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  backButtonText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '700',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  spacer: {
    width: 60,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    width: '100%',
    marginBottom: 20,
  },
  cardHeader: {
    color: '#94A3B8',
    fontSize: 10,
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
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
  },
  sectionHeader: {
    marginTop: 16,
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  controlBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  injectBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  injectBtnText: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 13,
  },
  syncBtn: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  syncBtnText: {
    color: '#6366F1',
    fontWeight: '700',
    fontSize: 13,
  },
  wipeBtn: {
    width: '100%',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  wipeBtnText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 13,
  },
  consoleWrapper: {
    height: 140,
    backgroundColor: '#050B14',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
  },
  consoleScroll: {
    flex: 1,
  },
  consolePlaceholder: {
    color: '#475569',
    fontSize: 12,
    fontStyle: 'italic',
  },
  consoleLog: {
    color: '#06B6D4',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 6,
  },
  statLine: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  highlightText: {
    color: '#10B981',
    fontWeight: '800',
  },
  uriText: {
    color: '#64748B',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  tableLabel: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 14,
    marginBottom: 8,
  },
  tableScroll: {
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 8,
    marginBottom: 16,
  },
  table: {
    minWidth: 400,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
  },
  tableHeaderRow: {
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  cell: {
    width: 65,
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '600',
    paddingRight: 4,
  },
  cellHeader: {
    color: '#94A3B8',
    fontWeight: '800',
  },
  noRowsText: {
    color: '#475569',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 10,
    fontStyle: 'italic',
  },
  textSynced: {
    color: '#10B981',
    fontWeight: '700',
  },
  textPending: {
    color: '#F59E0B',
    fontWeight: '700',
  },
  embeddingActive: {
    color: '#06B6D4',
  },
  embeddingPurged: {
    color: '#64748B',
    textDecorationLine: 'line-through',
  },
  extraSpacing: {
    height: 40,
  },
});
