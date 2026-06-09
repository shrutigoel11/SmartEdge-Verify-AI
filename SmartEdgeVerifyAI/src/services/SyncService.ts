/**
 * SyncService.ts
 *
 * Coordinates database synchronization when internet access becomes available.
 * Performs real HTTP POST requests to the configurable local API simulator
 * and logs every sync attempt into the SQLite audit table.
 */

import { NetworkService } from './NetworkService';
import { AttendanceDAO } from '../database/AttendanceDAO';
import { GPSLogsDAO } from '../database/GPSLogsDAO';
import { VerificationDAO } from '../database/VerificationDAO';
import { SyncAuditLogsDAO } from '../database/SyncAuditLogsDAO';
import { BackupService } from './BackupService';
import { ConfigUtil } from '../utils/ConfigUtil';

export interface SyncStatusReport {
  attendanceSyncedCount: number;
  gpsSyncedCount: number;
  verificationPurgedCount: number;
  logs: string[];
}

export class SyncService {
  private static isSyncingInProgress = false;
  private static listeners = new Set<(status: string) => void>();

  /**
   * Initializes automatic sync on network restoration.
   */
  public static init(): void {
    NetworkService.subscribe((isOnline) => {
      if (isOnline) {
        console.log('[SyncService] Online state detected. Triggering auto-sync...');
        this.syncAll().catch((err) => {
          console.error('[SyncService] Auto-sync failed:', err);
        });
      }
    });
  }

  /**
   * Subscribe to sync progress logs for UI updates.
   */
  public static subscribe(callback: (status: string) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private static notifyListeners(status: string): void {
    this.listeners.forEach((cb) => {
      try {
        cb(status);
      } catch (e) {
        // ignore
      }
    });
  }

  /**
   * Synchronizes all unsynced data to the local Datalake 3.0 server.
   */
  public static async syncAll(): Promise<SyncStatusReport> {
    if (this.isSyncingInProgress) {
      const msg = 'Sync already in progress. Skipping duplicate call.';
      console.log(`[SyncService] ${msg}`);
      return { attendanceSyncedCount: 0, gpsSyncedCount: 0, verificationPurgedCount: 0, logs: [msg] };
    }

    this.isSyncingInProgress = true;
    const report: SyncStatusReport = {
      attendanceSyncedCount: 0,
      gpsSyncedCount: 0,
      verificationPurgedCount: 0,
      logs: []
    };

    const addLog = (msg: string) => {
      const timestamped = `[${new Date().toLocaleTimeString()}] ${msg}`;
      report.logs.push(timestamped);
      this.notifyListeners(msg);
      console.log(`[SyncService] ${msg}`);
    };

    try {
      if (!NetworkService.isOnline()) {
        addLog('Sync aborted: Device is currently OFFLINE.');
        this.isSyncingInProgress = false;
        return report;
      }

      const baseUrl = ConfigUtil.getApiBaseUrl();
      addLog(`Initializing sync sequence to server: ${baseUrl}...`);

      // 1. Sync Attendance Logs
      const unsyncedAttendance = AttendanceDAO.getUnsyncedLogs();
      if (unsyncedAttendance.length > 0) {
        addLog(`Found ${unsyncedAttendance.length} unsynced attendance records.`);
        for (const log of unsyncedAttendance) {
          addLog(`Uploading punch event: Employee ${log.employee_id}, Date ${log.date}...`);
          
          let responseCode: number | null = null;
          try {
            const res = await fetch(`${baseUrl}/attendance`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(log),
            });
            responseCode = res.status;

            if (res.status === 200) {
              addLog(`Server responded 200 OK for Attendance ID: ${log.id}`);
              AttendanceDAO.markAsSynced(log.id);
              SyncAuditLogsDAO.insertAudit('attendance', log.id, log.retry_count + 1, 'SUCCESS', 200);
              report.attendanceSyncedCount++;
            } else {
              throw new Error(`HTTP Error Status: ${res.status}`);
            }
          } catch (uploadError: any) {
            addLog(`Error syncing Attendance ID ${log.id}: ${uploadError.message || uploadError}`);
            AttendanceDAO.logFailure(log.id);
            SyncAuditLogsDAO.insertAudit('attendance', log.id, log.retry_count + 1, 'FAILED', responseCode);
          }
        }
      } else {
        addLog('No pending attendance logs to synchronize.');
      }

      // 2. Sync GPS Logs
      const unsyncedGPS = GPSLogsDAO.getUnsyncedLogs();
      if (unsyncedGPS.length > 0) {
        addLog(`Found ${unsyncedGPS.length} unsynced background GPS logs.`);
        for (const log of unsyncedGPS) {
          addLog(`Uploading GPS waypoint: Lat ${log.latitude.toFixed(5)}, Lon ${log.longitude.toFixed(5)}...`);
          
          let responseCode: number | null = null;
          try {
            const res = await fetch(`${baseUrl}/gps`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(log),
            });
            responseCode = res.status;

            if (res.status === 200) {
              addLog(`Server responded 200 OK for GPS Log ID: ${log.id}`);
              GPSLogsDAO.markAsSynced(log.id);
              SyncAuditLogsDAO.insertAudit('gps', log.id, log.retry_count + 1, 'SUCCESS', 200);
              report.gpsSyncedCount++;
            } else {
              throw new Error(`HTTP Error Status: ${res.status}`);
            }
          } catch (uploadError: any) {
            addLog(`Error syncing GPS Log ID ${log.id}: ${uploadError.message || uploadError}`);
            GPSLogsDAO.logFailure(log.id);
            SyncAuditLogsDAO.insertAudit('gps', log.id, log.retry_count + 1, 'FAILED', responseCode);
          }
        }
      } else {
        addLog('No pending GPS logs to synchronize.');
      }

      // 3. Sync and Zero-Fill Purge Verification Logs
      const unsyncedVerification = VerificationDAO.getUnsyncedLogs();
      if (unsyncedVerification.length > 0) {
        addLog(`Found ${unsyncedVerification.length} unsynced biometric verification records.`);
        for (const log of unsyncedVerification) {
          addLog(`Uploading verification summary: Employee ${log.employee_id}, Confidence ${log.confidence.toFixed(4)}...`);
          
          let responseCode: number | null = null;
          try {
            // Package payload including cached embedding (if available before purge)
            const res = await fetch(`${baseUrl}/verification`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(log),
            });
            responseCode = res.status;

            if (res.status === 200) {
              addLog(`Server responded 200 OK for Verification ID: ${log.id}`);
              addLog(`Executing Zero-Fill Purge on sqlite cache block for ID: ${log.id}`);
              
              // Zero-fills database embedding and marks synced=1
              VerificationDAO.markAsSyncedAndPurge(log.id);
              SyncAuditLogsDAO.insertAudit('verification', log.id, 1, 'SUCCESS', 200);
              report.verificationPurgedCount++;
            } else {
              throw new Error(`HTTP Error Status: ${res.status}`);
            }
          } catch (uploadError: any) {
            addLog(`Error syncing Verification ID ${log.id}: ${uploadError.message || uploadError}`);
            SyncAuditLogsDAO.insertAudit('verification', log.id, 1, 'FAILED', responseCode);
          }
        }
      } else {
        addLog('No biometric data cached in queue.');
      }

      // 4. Update the local encrypted JSON backup
      addLog('Updating local encrypted backup.json with latest state...');
      await BackupService.createBackup();
      addLog('Backup file written and encrypted successfully.');

      addLog('Synchronization sequence completed. Local database is sanitized.');
    } catch (error: any) {
      addLog(`Sync process interrupted by error: ${error.message || error}`);
    } finally {
      this.isSyncingInProgress = false;
    }

    return report;
  }

  /**
   * Helper to fetch current queue lengths.
   */
  public static getPendingSyncCount(): { attendance: number; gps: number; verification: number; total: number } {
    try {
      const attendance = AttendanceDAO.getUnsyncedLogs().length;
      const gps = GPSLogsDAO.getUnsyncedLogs().length;
      const verification = VerificationDAO.getUnsyncedLogs().length;
      return {
        attendance,
        gps,
        verification,
        total: attendance + gps + verification
      };
    } catch (e) {
      return { attendance: 0, gps: 0, verification: 0, total: 0 };
    }
  }
}
