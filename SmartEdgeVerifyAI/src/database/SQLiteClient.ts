/**
 * SQLiteClient.ts
 *
 * Singleton manager to instantiate the local expo-sqlite connection.
 * Runs SQL migration scripts synchronously on app launch to prepare local database structures.
 * Utilizes the Expo SDK JSI synchronous interface for maximum performance.
 */

import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'SmartEdgeVerifyAI.db';

export class SQLiteClient {
  private static dbInstance: SQLite.SQLiteDatabase | null = null;

  /**
   * Opens and returns the SQLite database instance.
   */
  public static getDb(): SQLite.SQLiteDatabase {
    if (this.dbInstance) {
      return this.dbInstance;
    }

    try {
      const db = SQLite.openDatabaseSync(DATABASE_NAME);
      this.dbInstance = db;
      this.runMigrations(db);
      return db;
    } catch (error) {
      console.error('Failed to open expo-sqlite database:', error);
      throw error;
    }
  }

  /**
   * Synchronously sets up schemas for all required tables on startup.
   */
  private static runMigrations(db: SQLite.SQLiteDatabase): void {
    try {
      // 1. Create employees table
      db.execSync(`
        CREATE TABLE IF NOT EXISTS employees (
          employee_id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          department VARCHAR(100) NOT NULL,
          designation VARCHAR(100) NOT NULL,
          face_embedding BLOB
        );
      `);

      // 2. Create attendance_logs table
      db.execSync(`
        CREATE TABLE IF NOT EXISTS attendance_logs (
          id VARCHAR(50) PRIMARY KEY,
          employee_id VARCHAR(50) NOT NULL,
          date VARCHAR(20) NOT NULL,
          in_time VARCHAR(20) NOT NULL,
          out_time VARCHAR(20),
          working_hours VARCHAR(30),
          latitude REAL,
          longitude REAL,
          sync_status INTEGER DEFAULT 0, -- 0 = Pending, 1 = Synced
          retry_count INTEGER DEFAULT 0,
          last_attempt VARCHAR(50)
        );
      `);

      // 3. Create gps_logs table
      db.execSync(`
        CREATE TABLE IF NOT EXISTS gps_logs (
          id VARCHAR(50) PRIMARY KEY,
          timestamp VARCHAR(50) NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          sync_status INTEGER DEFAULT 0,
          retry_count INTEGER DEFAULT 0,
          last_attempt VARCHAR(50)
        );
      `);

      // 4. Create verification_logs table
      db.execSync(`
        CREATE TABLE IF NOT EXISTS verification_logs (
          id VARCHAR(50) PRIMARY KEY,
          employee_id VARCHAR(50) NOT NULL,
          confidence REAL NOT NULL,
          liveness_pass INTEGER NOT NULL,
          timestamp VARCHAR(50) NOT NULL,
          synced INTEGER DEFAULT 0,
          face_embedding_cache BLOB
        );
      `);

      // 5. Create sync_audit_logs table
      db.execSync(`
        CREATE TABLE IF NOT EXISTS sync_audit_logs (
          id VARCHAR(50) PRIMARY KEY,
          record_type VARCHAR(30) NOT NULL,
          record_id VARCHAR(50) NOT NULL,
          attempt_count INTEGER DEFAULT 1,
          timestamp VARCHAR(50) NOT NULL,
          status VARCHAR(20) NOT NULL,
          response_code INTEGER
        );
      `);

      console.log('SQLiteClient migrations run successfully. All tables initialized.');
    } catch (error) {
      console.error('SQLite migrations failure:', error);
      throw error;
    }
  }

  /**
   * Drops/Wipes all transactional tables for testing.
   */
  public static clearAllTables(): void {
    try {
      const db = this.getDb();
      db.execSync('DELETE FROM attendance_logs;');
      db.execSync('DELETE FROM gps_logs;');
      db.execSync('DELETE FROM verification_logs;');
      db.execSync('DELETE FROM sync_audit_logs;');
      db.execSync('DELETE FROM employees;');
      console.log('[SQLiteClient] All tables wiped.');
    } catch (e) {
      console.error('[SQLiteClient] Failed to wipe tables:', e);
      throw e;
    }
  }
}
