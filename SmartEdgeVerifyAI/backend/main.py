/**
 * main.py
 *
 * Local FastAPI backend server mimicking the Datalake 3.0 server pipeline.
 * Persists synchronizations in a local SQLite file (backend_datalake.db)
 * and renders a glassmorphic dashboard to monitor real-time sync activities and purges.
 */

import os
import sqlite3
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Configuration
DB_FILE = "backend_datalake.db"

app = FastAPI(
    title="SmartEdge Datalake 3.0 Local Simulator",
    description="Mock API endpoint aggregator for offline attendance synchronization testing.",
    version="1.0.0"
)

# Enable CORS for React Native mobile app connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model definitions matching mobile SQLite logs schemas
class AttendanceLog(BaseModel):
    id: str
    employee_id: str
    date: str
    in_time: str
    out_time: Optional[str] = None
    working_hours: Optional[str] = None
    latitude: float
    longitude: float
    sync_status: int
    retry_count: int
    last_attempt: Optional[str] = None

class GPSLog(BaseModel):
    id: str
    timestamp: str
    latitude: float
    longitude: float
    sync_status: int
    retry_count: int
    last_attempt: Optional[str] = None

class VerificationLog(BaseModel):
    id: str
    employee_id: str
    confidence: float
    liveness_pass: int
    timestamp: str
    synced: int
    face_embedding_cache: Optional[List[float]] = None

# Database Initialization
def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # 1. Attendance logs table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS attendance (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        date TEXT NOT NULL,
        in_time TEXT NOT NULL,
        out_time TEXT,
        working_hours TEXT,
        latitude REAL,
        longitude REAL,
        received_at TEXT NOT NULL
    );
    """)

    # 2. GPS logs table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS gps (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        received_at TEXT NOT NULL
    );
    """)

    # 3. Verification logs table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS verification (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        confidence REAL NOT NULL,
        liveness_pass INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        received_at TEXT NOT NULL,
        biometric_purged INTEGER DEFAULT 1
    );
    """)
    
    conn.commit()
    conn.close()
    print("[Database] Backend Datalake tables initialized successfully.")

# Run database setup
init_db()

# REST Endpoints
@app.post("/attendance")
def post_attendance(log: AttendanceLog):
    try:
        conn = get_db()
        cursor = conn.cursor()
        now_str = datetime.now().isoformat()
        
        cursor.execute(
            """INSERT OR REPLACE INTO attendance (id, employee_id, date, in_time, out_time, working_hours, latitude, longitude, received_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);""",
            (log.id, log.employee_id, log.date, log.in_time, log.out_time, log.working_hours, log.latitude, log.longitude, now_str)
        )
        conn.commit()
        conn.close()
        print(f"[Sync API] Attendance logged: Employee {log.employee_id}")
        return {"status": "success", "message": "Attendance log synced"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/gps")
def post_gps(log: GPSLog):
    try:
        conn = get_db()
        cursor = conn.cursor()
        now_str = datetime.now().isoformat()
        
        cursor.execute(
            """INSERT OR REPLACE INTO gps (id, timestamp, latitude, longitude, received_at)
               VALUES (?, ?, ?, ?, ?);""",
            (log.id, log.timestamp, log.latitude, log.longitude, now_str)
        )
        conn.commit()
        conn.close()
        print(f"[Sync API] GPS log recorded: Lat {log.latitude}, Lon {log.longitude}")
        return {"status": "success", "message": "GPS coordinate synced"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/verification")
def post_verification(log: VerificationLog):
    try:
        conn = get_db()
        cursor = conn.cursor()
        now_str = datetime.now().isoformat()
        
        # In a real pipeline, the server processes/validates the embedding and flags local device to purge.
        # Since local device purges on 200 OK, biometric cache is confirmed as purged.
        cursor.execute(
            """INSERT OR REPLACE INTO verification (id, employee_id, confidence, liveness_pass, timestamp, received_at, biometric_purged)
               VALUES (?, ?, ?, ?, ?, ?, 1);""",
            (log.id, log.employee_id, log.confidence, log.liveness_pass, log.timestamp, now_str)
        )
        conn.commit()
        conn.close()
        print(f"[Sync API] Biometric verification receipt registered: Employee {log.employee_id}")
        return {"status": "success", "message": "Verification details synced, local purge authorized"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/attendance")
def get_attendance():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM attendance ORDER BY received_at DESC;")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.get("/gps")
def get_gps():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM gps ORDER BY received_at DESC;")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.get("/verification")
def get_verification():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM verification ORDER BY received_at DESC;")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.get("/dashboard")
def get_dashboard_data():
    conn = get_db()
    cursor = conn.cursor()
    
    # Query logs
    cursor.execute("SELECT * FROM attendance ORDER BY received_at DESC LIMIT 50;")
    attendance = [dict(row) for row in cursor.fetchall()]
    
    cursor.execute("SELECT * FROM gps ORDER BY received_at DESC LIMIT 50;")
    gps = [dict(row) for row in cursor.fetchall()]
    
    cursor.execute("SELECT * FROM verification ORDER BY received_at DESC LIMIT 50;")
    verification = [dict(row) for row in cursor.fetchall()]
    
    # Calculate stats
    total_attendance = len(attendance)
    total_gps = len(gps)
    total_verification = len(verification)
    
    cursor.execute("SELECT COUNT(DISTINCT employee_id) as count FROM attendance;")
    active_employees = cursor.fetchone()["count"]
    
    conn.close()
    
    return {
        "attendance": attendance,
        "gps": gps,
        "verification": verification,
        "stats": {
            "total_attendance": total_attendance,
            "total_gps": total_gps,
            "total_verification": total_verification,
            "active_employees": active_employees
        }
    }

# Web UI Dashboard Simulator Page
@app.get("/", response_class=HTMLResponse)
def index_page():
    return """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Datalake 3.0 Sync Dashboard Simulator</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&family=JetBrains+Mono&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #0B0F19;
            --card-bg: rgba(17, 24, 39, 0.75);
            --border-color: rgba(255, 255, 255, 0.08);
            --primary: #6366F1;
            --accent: #06B6D4;
            --success: #10B981;
            --warning: #F59E0B;
            --danger: #EF4444;
            --text-main: #F8FAFC;
            --text-mute: #64748B;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            background-color: var(--bg-color);
            color: var(--text-main);
            font-family: 'Outfit', sans-serif;
            padding: 24px;
            overflow-x: hidden;
            background-image: radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.1) 0%, transparent 40%),
                              radial-gradient(circle at 90% 80%, rgba(6, 182, 212, 0.08) 0%, transparent 40%);
            background-attachment: fixed;
        }

        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            border-bottom: 1.5px solid var(--border-color);
            padding-bottom: 16px;
        }

        h1 {
            font-size: 26px;
            font-weight: 800;
            letter-spacing: -0.5px;
            background: linear-gradient(135deg, #FFF 0%, #94A3B8 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .subtitle {
            font-size: 13px;
            color: var(--text-mute);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            margin-top: 4px;
        }

        .server-status {
            display: flex;
            align-items: center;
            background: rgba(16, 185, 129, 0.1);
            border: 1px solid rgba(16, 185, 129, 0.25);
            padding: 6px 14px;
            border-radius: 20px;
            color: var(--success);
            font-size: 12px;
            font-weight: 700;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: var(--success);
            margin-right: 8px;
            animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
            0% { opacity: 0.4; }
            50% { opacity: 1; }
            100% { opacity: 0.4; }
        }

        /* Stats Grid */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 20px;
            margin-bottom: 24px;
        }

        .stat-card {
            background: var(--card-bg);
            border: 1.5px solid var(--border-color);
            border-radius: 16px;
            padding: 20px;
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
            transition: transform 0.2s ease, border-color 0.2s ease;
        }

        .stat-card:hover {
            transform: translateY(-2px);
            border-color: rgba(99, 102, 241, 0.25);
        }

        .stat-label {
            font-size: 11px;
            font-weight: 800;
            color: var(--text-mute);
            text-transform: uppercase;
            letter-spacing: 1.2px;
            margin-bottom: 8px;
        }

        .stat-value {
            font-size: 32px;
            font-weight: 800;
            color: var(--text-main);
        }

        .val-cyan { color: var(--accent); }
        .val-indigo { color: var(--primary); }
        .val-green { color: var(--success); }

        /* Main Workspace Panels */
        .panel-row {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 24px;
            margin-bottom: 24px;
        }

        @media (max-width: 1024px) {
            .panel-row {
                grid-template-columns: 1fr;
            }
        }

        .panel {
            background: var(--card-bg);
            border: 1.5px solid var(--border-color);
            border-radius: 20px;
            padding: 20px;
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4);
            display: flex;
            flex-direction: column;
            max-height: 480px;
        }

        .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .panel-title {
            font-size: 15px;
            font-weight: 700;
            letter-spacing: 0.5px;
            color: var(--text-main);
        }

        /* Table design */
        .table-wrapper {
            overflow-y: auto;
            flex: 1;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
        }

        th {
            background-color: rgba(255, 255, 255, 0.02);
            color: var(--text-mute);
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 1px;
            padding: 12px 16px;
            border-bottom: 1.5px solid var(--border-color);
        }

        td {
            padding: 14px 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            font-size: 13px;
            color: #E2E8F0;
            font-weight: 500;
        }

        tr:hover td {
            background-color: rgba(255, 255, 255, 0.01);
        }

        .mono {
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
        }

        .badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.5px;
        }

        .badge-green {
            background: rgba(16, 185, 129, 0.15);
            color: var(--success);
            border: 1px solid rgba(16, 185, 129, 0.2);
        }
        
        .badge-cyan {
            background: rgba(6, 182, 212, 0.15);
            color: var(--accent);
            border: 1px solid rgba(6, 182, 212, 0.2);
        }

        /* Live Activity Stream */
        .log-stream {
            list-style: none;
            overflow-y: auto;
            flex: 1;
            padding-right: 4px;
        }

        .log-item {
            padding: 10px 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            font-size: 12px;
            line-height: 16px;
            display: flex;
            align-items: flex-start;
            gap: 8px;
        }

        .log-time {
            color: var(--text-mute);
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            white-space: nowrap;
        }

        .log-text {
            color: #E2E8F0;
            font-weight: 500;
        }

        /* Scrollbar styles */
        ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }
        ::-webkit-scrollbar-track {
            background: transparent;
        }
        ::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.2);
        }

        /* Sub-grids */
        .sub-grids {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
        }

        @media (max-width: 768px) {
            .sub-grids {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>

    <header>
        <div>
            <h1>DATALAKE 3.0</h1>
            <div class="subtitle">Field Authentication & Synchronization Simulator</div>
        </div>
        <div class="server-status">
            <div class="status-dot"></div>
            RECEIVING PIPELINE ACTIVE
        </div>
    </header>

    <!-- Stat Summary Cards -->
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-label">Total Attendance Transmitted</div>
            <div class="stat-value val-cyan" id="stat-attendance">0</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Active Field Personnel</div>
            <div class="stat-value val-indigo" id="stat-employees">0</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">GPS Waypoints Logs</div>
            <div class="stat-value val-green" id="stat-gps">0</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Zero-Fill Verified Purges</div>
            <div class="stat-value val-green" id="stat-purges" style="color:#10B981">0</div>
        </div>
    </div>

    <!-- Main Live Rows -->
    <div class="panel-row">
        <!-- Attendance Records -->
        <div class="panel">
            <div class="panel-header">
                <div class="panel-title">LIVE PERSONNEL ATTENDANCE BOARD</div>
            </div>
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Employee ID</th>
                            <th>Date</th>
                            <th>Punch In</th>
                            <th>Punch Out</th>
                            <th>Working Hours</th>
                            <th>Geotag Coordinates</th>
                            <th>Sync State</th>
                        </tr>
                    </thead>
                    <tbody id="attendance-rows">
                        <tr>
                            <td colspan="7" style="text-align: center; color: var(--text-mute);">Awaiting synchronizations...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Live Activity Stream -->
        <div class="panel">
            <div class="panel-header">
                <div class="panel-title">DATALAKE LIVE TRANSACTION FEED</div>
            </div>
            <ul class="log-stream" id="activity-logs">
                <li class="log-item" style="color: var(--text-mute); justify-content: center;">Terminal Listening for sync packets...</li>
            </ul>
        </div>
    </div>

    <!-- Secondary Rows (GPS and Biometrics) -->
    <div class="sub-grids">
        <!-- GPS Logs -->
        <div class="panel">
            <div class="panel-header">
                <div class="panel-title">BACKGROUND SATELLITE GPS LOGS (1HR)</div>
            </div>
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Latitude</th>
                            <th>Longitude</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="gps-rows">
                        <tr>
                            <td colspan="4" style="text-align: center; color: var(--text-mute);">No coordinates logged.</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Biometric Verification Audit -->
        <div class="panel">
            <div class="panel-header">
                <div class="panel-title">BIOMETRIC LIVENESS AUDIT LOGS</div>
            </div>
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Personnel ID</th>
                            <th>Confidence</th>
                            <th>Liveness Check</th>
                            <th>Biometric Embedding Status</th>
                        </tr>
                    </thead>
                    <tbody id="verification-rows">
                        <tr>
                            <td colspan="4" style="text-align: center; color: var(--text-mute);">No verification events.</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        const activityLogs = [];
        
        async function fetchDashboardData() {
            try {
                const response = await fetch('/dashboard');
                const data = await response.json();
                
                // Update stats
                document.getElementById('stat-attendance').innerText = data.stats.total_attendance;
                document.getElementById('stat-employees').innerText = data.stats.active_employees;
                document.getElementById('stat-gps').innerText = data.stats.total_gps;
                document.getElementById('stat-purges').innerText = data.stats.total_verification; // Purges count is same as total verification receipt
                
                // Update Attendance Table
                const attBody = document.getElementById('attendance-rows');
                if (data.attendance.length === 0) {
                    attBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-mute);">Awaiting synchronizations...</td></tr>';
                } else {
                    let html = '';
                    data.attendance.forEach(row => {
                        const inTime = row.in_time;
                        const outTime = row.out_time ? row.out_time : '--:-- --';
                        const hours = row.working_hours ? row.working_hours : 'Calculating...';
                        html += `
                            <tr>
                                <td><strong>${row.employee_id}</strong></td>
                                <td>${row.date}</td>
                                <td class="mono">${inTime}</td>
                                <td class="mono">${outTime}</td>
                                <td>${hours}</td>
                                <td class="mono">${row.latitude.toFixed(5)}, ${row.longitude.toFixed(5)}</td>
                                <td><span class="badge badge-green">SYNCED (200 OK)</span></td>
                            </tr>
                        `;
                    });
                    attBody.innerHTML = html;
                }

                // Update GPS Table
                const gpsBody = document.getElementById('gps-rows');
                if (data.gps.length === 0) {
                    gpsBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-mute);">No coordinates logged.</td></tr>';
                } else {
                    let html = '';
                    data.gps.forEach(row => {
                        const date = new Date(row.timestamp);
                        html += `
                            <tr>
                                <td class="mono">${date.toLocaleTimeString()}</td>
                                <td class="mono">${row.latitude.toFixed(5)}°</td>
                                <td class="mono">${row.longitude.toFixed(5)}°</td>
                                <td><span class="badge badge-green">RECEIPT LOCKED</span></td>
                            </tr>
                        `;
                    });
                    gpsBody.innerHTML = html;
                }

                // Update Verification Table
                const verBody = document.getElementById('verification-rows');
                if (data.verification.length === 0) {
                    verBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-mute);">No verification events.</td></tr>';
                } else {
                    let html = '';
                    data.verification.forEach(row => {
                        const score = (row.confidence * 100).toFixed(2) + '%';
                        const statusBadge = row.biometric_purged === 1 
                            ? '<span class="badge badge-cyan">🔒 ZERO-FILL PURGED</span>' 
                            : '<span class="badge badge-green">ACTIVE IN CACHE</span>';
                        html += `
                            <tr>
                                <td><strong>${row.employee_id}</strong></td>
                                <td>${score}</td>
                                <td><span class="badge badge-green">LIVENESS OK</span></td>
                                <td>${statusBadge}</td>
                            </tr>
                        `;
                    });
                    verBody.innerHTML = html;
                }

                // Generate Activity Feed Logs from data
                updateActivityLogs(data);

            } catch (e) {
                console.error('Failed to fetch dashboard updates:', e);
            }
        }

        function updateActivityLogs(data) {
            const feed = document.getElementById('activity-logs');
            const items = [];
            
            // Loop through entries and add logs
            data.attendance.slice(0, 10).forEach(row => {
                items.push({
                    time: new Date(row.received_at),
                    text: `🟢 Received punch log for employee ${row.employee_id} (Date: ${row.date}, In: ${row.in_time})`
                });
                if (row.out_time) {
                    items.push({
                        time: new Date(row.received_at),
                        text: `🔴 Received clock-out for employee ${row.employee_id} (Working Hours: ${row.working_hours})`
                    });
                }
            });

            data.gps.slice(0, 10).forEach(row => {
                items.push({
                    time: new Date(row.received_at),
                    text: `📍 Captured background GPS coordinates: Lat ${row.latitude.toFixed(4)}, Lon ${row.longitude.toFixed(4)}`
                });
            });

            data.verification.slice(0, 10).forEach(row => {
                items.push({
                    time: new Date(row.received_at),
                    text: `🔒 Authenticated Employee ${row.employee_id}. Face embedding purges executed on device.`
                });
                items.push({
                    time: new Date(row.received_at),
                    text: `💾 Remote encrypted backup.json synchronized for Employee ${row.employee_id}`
                });
            });

            // Sort items by time desc
            items.sort((a, b) => b.time - a.time);

            if (items.length === 0) {
                feed.innerHTML = '<li class="log-item" style="color: var(--text-mute); justify-content: center;">Terminal Listening for sync packets...</li>';
            } else {
                let html = '';
                items.slice(0, 15).forEach(item => {
                    html += `
                        <li class="log-item">
                            <span class="log-time">[${item.time.toLocaleTimeString()}]</span>
                            <span class="log-text">${item.text}</span>
                        </li>
                    `;
                });
                feed.innerHTML = html;
            }
        }

        // Poll API every 2 seconds
        setInterval(fetchDashboardData, 2000);
        fetchDashboardData();
    </script>
</body>
</html>
    """
