import duckdb from 'duckdb';
import { getAllLicenses, getAllEvents, getAllAuditLogs } from './db';
import { License, LicenseEvent, AuditLog } from './types';

// Initialize embedded in-memory DuckDB database
const duckDB = new duckdb.Database(':memory:');

// Helper to query DuckDB with Promises
export function queryDuckDB(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    duckDB.all(sql, ...params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Set up schema inside DuckDB
export async function initializeDuckDBSchema() {
  try {
    await queryDuckDB(`
      CREATE TABLE IF NOT EXISTS licenses (
        id VARCHAR,
        software_name VARCHAR,
        tier VARCHAR,
        license_key VARCHAR,
        status VARCHAR,
        issued_to VARCHAR,
        hardware_id VARCHAR,
        ip_whitelist VARCHAR,
        features VARCHAR,
        max_volume_usd DOUBLE,
        api_calls_limit INTEGER,
        created_at VARCHAR,
        expires_at VARCHAR,
        product_price DOUBLE,
        current_earnings DOUBLE,
        daily_earnings DOUBLE,
        weekly_earnings DOUBLE,
        monthly_earnings DOUBLE,
        last_active_ip VARCHAR,
        device_fingerprint VARCHAR,
        asset_classes VARCHAR,
        restricted_accounts VARCHAR,
        billing_cycle VARCHAR
      );
    `);

    await queryDuckDB(`
      CREATE TABLE IF NOT EXISTS license_events (
        id VARCHAR,
        license_id VARCHAR,
        event_type VARCHAR,
        event_data VARCHAR,
        timestamp VARCHAR
      );
    `);

    await queryDuckDB(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR,
        user_id VARCHAR,
        user_name VARCHAR,
        action VARCHAR,
        entity_type VARCHAR,
        entity_id VARCHAR,
        details VARCHAR,
        timestamp VARCHAR
      );
    `);
    console.log("Embedded DuckDB schema initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize DuckDB schema:", err);
  }
}

// Synchronize SQLite data into DuckDB for real-time analytics
export async function syncSQLiteToDuckDB() {
  try {
    const licenses = getAllLicenses();
    const events = getAllEvents();
    const logs = getAllAuditLogs();

    // Clear old records in DuckDB
    await queryDuckDB('DELETE FROM licenses');
    await queryDuckDB('DELETE FROM license_events');
    await queryDuckDB('DELETE FROM audit_logs');

    // Batch insert into DuckDB
    for (const l of licenses) {
      await queryDuckDB(`
        INSERT INTO licenses VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `, [
        l.id, l.software_name, l.tier, l.license_key, l.status, l.issued_to,
        l.hardware_id || null, l.ip_whitelist || null, l.features || null,
        l.max_volume_usd || 0, l.api_calls_limit || 0, l.created_at, l.expires_at,
        l.product_price || 0, l.current_earnings || 0, l.daily_earnings || 0,
        l.weekly_earnings || 0, l.monthly_earnings || 0, l.last_active_ip || null,
        l.device_fingerprint || null, l.asset_classes || '[]', l.restricted_accounts || '[]',
        l.billing_cycle || 'onetime'
      ]);
    }
    for (const e of events) {
      await queryDuckDB(`
        INSERT INTO license_events VALUES (?, ?, ?, ?, ?)
      `, [
        e.id, e.license_id, e.event_type, e.event_data, e.timestamp
      ]);
    }

    for (const log of logs) {
      await queryDuckDB(`
        INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        log.id, log.user_id, log.user_name, log.action, log.entity_type, log.entity_id, log.details, log.timestamp
      ]);
    }
  } catch (err) {
    console.error("Error synchronizing SQLite to DuckDB:", err);
  }
}

export interface RiskAnalysis {
  license_id: string;
  failed_pings: number;
  distinct_ips: number;
  distinct_hwids: number;
  risk_score: number;
  failed_pings_last_hour: number;
  high_risk_flag: boolean;
}

// Run DuckDB OLAP aggregation query to calculate the Security Risk Score
export async function calculateDuckDBRiskScores(): Promise<Record<string, RiskAnalysis>> {
  await syncSQLiteToDuckDB();

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  try {
    // Advanced analytical query using DuckDB functions
    const rows = await queryDuckDB(`
      WITH EventStats AS (
        SELECT 
          license_id,
          COUNT(CASE WHEN event_type = 'verification_failed' THEN 1 END) as failed_pings,
          COUNT(CASE WHEN event_type = 'verification_failed' AND timestamp >= ? THEN 1 END) as failed_pings_last_hour,
          COUNT(DISTINCT CASE WHEN event_type = 'verification_success' OR event_type = 'verification_failed' THEN 
            COALESCE(
              regexp_extract(event_data, '"ip":"([^"]+)"', 1),
              regexp_extract(event_data, '"provided_ip":"([^"]+)"', 1)
            )
          END) as distinct_ips,
          COUNT(DISTINCT CASE WHEN event_type = 'verification_success' OR event_type = 'verification_failed' THEN 
            COALESCE(
              regexp_extract(event_data, '"hardware_id":"([^"]+)"', 1),
              regexp_extract(event_data, '"provided_hwid":"([^"]+)"', 1)
            )
          END) as distinct_hwids
        FROM license_events
        GROUP BY license_id
      )
      SELECT 
        l.id as license_id,
        COALESCE(e.failed_pings, 0) as failed_pings,
        COALESCE(e.failed_pings_last_hour, 0) as failed_pings_last_hour,
        COALESCE(e.distinct_ips, 0) as distinct_ips,
        COALESCE(e.distinct_hwids, 0) as distinct_hwids,
        l.status
      FROM licenses l
      LEFT JOIN EventStats e ON l.id = e.license_id
    `, [oneHourAgo]);

    const result: Record<string, RiskAnalysis> = {};
    for (const r of rows) {
      const failed_pings = Number(r.failed_pings || 0);
      const failed_pings_last_hour = Number(r.failed_pings_last_hour || 0);
      const distinct_ips = Number(r.distinct_ips || 0);
      const distinct_hwids = Number(r.distinct_hwids || 0);
      const high_risk_flag = failed_pings_last_hour > 2;

      // Risk Score calculation matrix
      let score = 0;

      // Failed pings (up to 30 points)
      score += Math.min(failed_pings * 10, 30);

      // Multiple IP addresses (indicates location changes - up to 35 points)
      if (distinct_ips > 1) {
        score += Math.min((distinct_ips - 1) * 15, 35);
      }

      // Hardware inconsistency (indicates sharing/cloning - up to 35 points)
      if (distinct_hwids > 1) {
        score += Math.min((distinct_hwids - 1) * 20, 35);
      }

      // Add high risk flag penalty (forces a critical rating or adds major points)
      if (high_risk_flag) {
        score += 50; // Add 50 points penalty for brute-forcing / abnormal fails within 1h
      }

      // Add license status impact
      if (r.status === 'revoked') {
        score += 50;
      } else if (r.status === 'suspended') {
        score += 25;
      }

      result[r.license_id] = {
        license_id: r.license_id,
        failed_pings: failed_pings,
        distinct_ips: distinct_ips,
        distinct_hwids: distinct_hwids,
        risk_score: Math.min(score, 100),
        failed_pings_last_hour: failed_pings_last_hour,
        high_risk_flag: high_risk_flag
      };
    }
    return result;
  } catch (err) {
    console.error("DuckDB Risk calculation failed, returning fallback:", err);
    return {};
  }
}

export async function checkDuckDBHealth() {
  try {
    const tableCount = await queryDuckDB("SELECT count(*) as count FROM information_schema.tables WHERE table_schema = 'main'");
    const licenseCount = await queryDuckDB("SELECT count(*) as count FROM licenses");
    
    return {
      status: 'healthy',
      tables: Number(tableCount[0]?.count || 0),
      records: Number(licenseCount[0]?.count || 0),
      memory_usage: process.memoryUsage().heapUsed,
      type: 'in-memory'
    };
  } catch (err) {
    return {
      status: 'error',
      error: (err as Error).message
    };
  }
}
