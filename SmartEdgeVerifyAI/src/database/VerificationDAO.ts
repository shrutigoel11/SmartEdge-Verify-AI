/**
 * VerificationDAO.ts
 *
 * Data Access Object for 'verification_logs' table.
 * Manages insertions of authentication transaction details, temporary embedding caching,
 * and secure zero-fill purging protocols on completion.
 */

import { SQLiteClient } from './SQLiteClient';
import { UUIDGenerator } from '../utils/UUIDGenerator';

export interface VerificationLog {
  id: string;
  employee_id: string;
  confidence: number;
  liveness_pass: number;
  timestamp: string;
  synced: number;
  face_embedding_cache: number[] | null;
}

export class VerificationDAO {
  /**
   * Logs a biometric verification attempt.
   */
  public static insertVerificationLog(
    employeeId: string,
    confidence: number,
    livenessPass: boolean,
    faceEmbedding: number[]
  ): VerificationLog {
    const db = SQLiteClient.getDb();
    const uuid = UUIDGenerator.generate();
    const nowStr = new Date().toISOString();

    const float32Arr = new Float32Array(faceEmbedding);
    const embeddingBlob = new Uint8Array(float32Arr.buffer);

    const log: VerificationLog = {
      id: uuid,
      employee_id: employeeId,
      confidence,
      liveness_pass: livenessPass ? 1 : 0,
      timestamp: nowStr,
      synced: 0,
      face_embedding_cache: faceEmbedding,
    };

    db.runSync(
      `INSERT INTO verification_logs (id, employee_id, confidence, liveness_pass, timestamp, synced, face_embedding_cache)
       VALUES (?, ?, ?, ?, ?, 0, ?);`,
      [
        log.id,
        log.employee_id,
        log.confidence,
        log.liveness_pass,
        log.timestamp,
        embeddingBlob
      ]
    );

    return log;
  }

  /**
   * Retrieves all unsynced verification logs.
   */
  public static getUnsyncedLogs(): VerificationLog[] {
    const db = SQLiteClient.getDb();
    const rows = db.getAllSync<any>(
      'SELECT * FROM verification_logs WHERE synced = 0;'
    );

    return rows.map(r => this.mapRow(r));
  }

  /**
   * Retrieves all verification logs.
   */
  public static getAllLogs(): VerificationLog[] {
    const db = SQLiteClient.getDb();
    const rows = db.getAllSync<any>(
      'SELECT * FROM verification_logs ORDER BY timestamp DESC;'
    );

    return rows.map(r => this.mapRow(r));
  }

  /**
   * Executes the SECURE PURGE on the target record.
   * Sets face_embedding_cache = NULL and synced = 1.
   * Overwrites with zero bytes on-disk first.
   */
  public static markAsSyncedAndPurge(id: string): void {
    const db = SQLiteClient.getDb();

    // 1. Overwrite cache with zeroes
    db.runSync(
      `UPDATE verification_logs 
       SET face_embedding_cache = ZEROBLOB(512) 
       WHERE id = ?;`,
      [id]
    );

    // 2. Clear cache and mark synced
    db.runSync(
      `UPDATE verification_logs 
       SET face_embedding_cache = NULL, synced = 1 
       WHERE id = ?;`,
      [id]
    );

    console.log(`[VerificationDAO] Secure purge completed for verification log: ${id}`);
  }

  private static mapRow(row: any): VerificationLog {
    let face_embedding_cache: number[] | null = null;
    if (row.face_embedding_cache) {
      const buffer = row.face_embedding_cache.buffer || row.face_embedding_cache;
      const float32Arr = new Float32Array(buffer);
      face_embedding_cache = Array.from(float32Arr);
    }

    return {
      id: row.id,
      employee_id: row.employee_id,
      confidence: row.confidence,
      liveness_pass: row.liveness_pass,
      timestamp: row.timestamp,
      synced: row.synced,
      face_embedding_cache,
    };
  }
}
