/**
 * SyncAuditLogsDAO.ts
 *
 * Data Access Object for 'sync_audit_logs' table.
 * Records the results of each SQLite log sync upload attempt for audit trails and demonstrations.
 */

import { SQLiteClient } from './SQLiteClient';
import { UUIDGenerator } from '../utils/UUIDGenerator';

export interface SyncAuditLog {
  id: string;
  record_type: string;
  record_id: string;
  attempt_count: number;
  timestamp: string; // ISO DateTime
  status: string; // 'SUCCESS' | 'FAILED'
  response_code: number | null;
}

export class SyncAuditLogsDAO {
  /**
   * Inserts an attempt log record.
   */
  public static insertAudit(
    recordType: string,
    recordId: string,
    attemptCount: number,
    status: string,
    responseCode: number | null
  ): SyncAuditLog {
    try {
      const db = SQLiteClient.getDb();
      const uuid = UUIDGenerator.generate();
      const nowStr = new Date().toISOString();

      const log: SyncAuditLog = {
        id: uuid,
        record_type: recordType,
        record_id: recordId,
        attempt_count: attemptCount,
        timestamp: nowStr,
        status,
        response_code: responseCode,
      };

      db.runSync(
        `INSERT INTO sync_audit_logs (id, record_type, record_id, attempt_count, timestamp, status, response_code)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [
          log.id,
          log.record_type,
          log.record_id,
          log.attempt_count,
          log.timestamp,
          log.status,
          log.response_code
        ]
      );

      return log;
    } catch (error) {
      console.error('[SyncAuditLogsDAO] Failed to insert audit log:', error);
      throw error;
    }
  }

  /**
   * Retrieves all audit logs, ordered by newest first.
   */
  public static getAllAudits(): SyncAuditLog[] {
    try {
      const db = SQLiteClient.getDb();
      const rows = db.getAllSync<any>(
        'SELECT * FROM sync_audit_logs ORDER BY timestamp DESC;'
      );

      return rows.map((r) => ({
        id: r.id,
        record_type: r.record_type,
        record_id: r.record_id,
        attempt_count: r.attempt_count,
        timestamp: r.timestamp,
        status: r.status,
        response_code: r.response_code,
      }));
    } catch (e) {
      console.error('[SyncAuditLogsDAO] Failed to query audits:', e);
      return [];
    }
  }

  /**
   * Wipes the audit logs table.
   */
  public static clearAudits(): void {
    try {
      const db = SQLiteClient.getDb();
      db.runSync('DELETE FROM sync_audit_logs;');
      console.log('[SyncAuditLogsDAO] Audit logs table cleared.');
    } catch (e) {
      console.error('[SyncAuditLogsDAO] Failed to clear audits:', e);
    }
  }
}
