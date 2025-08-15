// import { getConnectionPool } from './database-connection-pool'; // Disabled for build
// import { getCacheService } from './redis-cache-service'; // Disabled for build
import { createClient } from '@/lib/supabase/client';

export interface DatabaseMetrics {
  // Connection metrics
  connections: {
    total: number;
    active: number;
    idle: number;
    waiting: number;
    maxConnections: number;
  };
  
  // Query performance metrics
  queries: {
    totalQueries: number;
    averageQueryTime: number;
    slowQueries: number;
    queriesPerSecond: number;
    cacheHitRate: number;
  };
  
  // Database size metrics
  database: {
    size: string;
    tableCount: number;
    indexSize: string;
    totalSize: string;
  };
  
  // Performance metrics
  performance: {
    cacheHitRatio: number;
    transactionsPerSecond: number;
    blocksRead: number;
    blocksHit: number;
    deadlocks: number;
  };
  
  // System health
  health: {
    status: 'healthy' | 'warning' | 'critical';
    uptime: string;
    lastBackup?: string;
    replicationLag?: number;
  };
  
  timestamp: string;
}

export interface SlowQuery {
  query: string;
  calls: number;
  totalTime: number;
  meanTime: number;
  rows: number;
  hitPercent: number;
}

export interface TableStatistics {
  tableName: string;
  size: string;
  rowCount: number;
  indexSize: string;
  sequentialScans: number;
  indexScans: number;
  insertsPerSecond: number;
  updatesPerSecond: number;
  deletesPerSecond: number;
}

export interface SystemAlert {
  id: string;
  type: 'connection' | 'performance' | 'storage' | 'replication';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: string;
  resolved: boolean;
  metadata?: Record<string, any>;
}

export class DatabaseMonitoringService {
  private connectionPool = getConnectionPool();
  private cache = getCacheService();
  private alerts: SystemAlert[] = [];
  private monitoringInterval?: NodeJS.Timeout;
  private alertThresholds = {
    slowQueryThreshold: 1000, // ms
    connectionUtilizationThreshold: 80, // %
    cacheHitRatioThreshold: 90, // %
    diskUsageThreshold: 85, // %
    replicationLagThreshold: 5000 // ms
  };

  constructor() {
    this.startMonitoring();
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
        await this.checkAlerts();
      } catch (error) {
        console.error('Database monitoring error:', error);
      }
    }, intervalMs);

    console.log(`Database monitoring started with ${intervalMs}ms interval`);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  /**
   * Collect comprehensive database metrics
   */
  async collectMetrics(): Promise<DatabaseMetrics> {
    const [
      connectionMetrics,
      queryMetrics,
      databaseSizeMetrics,
      performanceMetrics,
      healthMetrics
    ] = await Promise.all([
      this.getConnectionMetrics(),
      this.getQueryMetrics(),
      this.getDatabaseSizeMetrics(),
      this.getPerformanceMetrics(),
      this.getHealthMetrics()
    ]);

    const metrics: DatabaseMetrics = {
      connections: connectionMetrics,
      queries: queryMetrics,
      database: databaseSizeMetrics,
      performance: performanceMetrics,
      health: healthMetrics,
      timestamp: new Date().toISOString()
    };

    // Cache metrics for dashboard
    await this.cache.set('db:metrics:latest', metrics, 300); // 5 minutes

    return metrics;
  }

  private async getConnectionMetrics(): Promise<DatabaseMetrics['connections']> {
    const poolStats = await this.connectionPool.getPoolStatistics();
    const poolMetrics = this.connectionPool.getMetrics();

    const result = await this.connectionPool.executeRead(`
      SELECT 
        setting::int as max_connections
      FROM pg_settings 
      WHERE name = 'max_connections'
    `);

    const maxConnections = result.rows[0]?.max_connections || 100;

    return {
      total: poolMetrics.totalConnections,
      active: poolMetrics.activeConnections,
      idle: poolMetrics.idleConnections,
      waiting: poolMetrics.waitingClients,
      maxConnections
    };
  }

  private async getQueryMetrics(): Promise<DatabaseMetrics['queries']> {
    const poolMetrics = this.connectionPool.getMetrics();
    const cacheMetrics = this.cache.getMetrics();

    // Get slow queries count
    const slowQueriesResult = await this.connectionPool.executeRead(`
      SELECT count(*) as slow_queries
      FROM pg_stat_statements
      WHERE mean_time > $1
    `, [this.alertThresholds.slowQueryThreshold]);

    const slowQueries = parseInt(slowQueriesResult.rows[0]?.slow_queries || '0');

    // Calculate queries per second (simplified)
    const queriesPerSecond = poolMetrics.totalQueries / 60; // Assuming 1-minute window

    return {
      totalQueries: poolMetrics.totalQueries,
      averageQueryTime: poolMetrics.averageQueryTime,
      slowQueries,
      queriesPerSecond,
      cacheHitRate: cacheMetrics.hitRate * 100
    };
  }

  private async getDatabaseSizeMetrics(): Promise<DatabaseMetrics['database']> {
    const result = await this.connectionPool.executeRead(`
      SELECT 
        pg_size_pretty(pg_database_size(current_database())) as database_size,
        (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') as table_count,
        pg_size_pretty(
          (SELECT sum(pg_indexes_size(c.oid))
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public')
        ) as index_size,
        pg_size_pretty(
          pg_database_size(current_database()) + 
          (SELECT sum(pg_indexes_size(c.oid))
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public')
        ) as total_size
    `);

    const row = result.rows[0];
    return {
      size: row?.database_size || '0 bytes',
      tableCount: parseInt(row?.table_count || '0'),
      indexSize: row?.index_size || '0 bytes',
      totalSize: row?.total_size || '0 bytes'
    };
  }

  private async getPerformanceMetrics(): Promise<DatabaseMetrics['performance']> {
    const result = await this.connectionPool.executeRead(`
      SELECT 
        round(
          100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2
        ) as cache_hit_ratio,
        round(
          (xact_commit + xact_rollback) / 
          EXTRACT(EPOCH FROM (now() - stats_reset)), 2
        ) as transactions_per_second,
        sum(blks_read) as blocks_read,
        sum(blks_hit) as blocks_hit,
        sum(deadlocks) as deadlocks
      FROM pg_stat_database
      WHERE datname = current_database()
    `);

    const row = result.rows[0];
    return {
      cacheHitRatio: parseFloat(row?.cache_hit_ratio || '0'),
      transactionsPerSecond: parseFloat(row?.transactions_per_second || '0'),
      blocksRead: parseInt(row?.blocks_read || '0'),
      blocksHit: parseInt(row?.blocks_hit || '0'),
      deadlocks: parseInt(row?.deadlocks || '0')
    };
  }

  private async getHealthMetrics(): Promise<DatabaseMetrics['health']> {
    try {
      const result = await this.connectionPool.executeRead(`
        SELECT 
          EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time())) as uptime_seconds,
          pg_is_in_recovery() as is_replica
      `);

      const row = result.rows[0];
      const uptimeSeconds = parseInt(row?.uptime_seconds || '0');
      const uptime = this.formatUptime(uptimeSeconds);

      // Determine health status based on various metrics
      const status = await this.determineHealthStatus();

      return {
        status,
        uptime,
        lastBackup: await this.getLastBackupTime(),
        replicationLag: row?.is_replica ? await this.getReplicationLag() : undefined
      };
    } catch (error) {
      return {
        status: 'critical',
        uptime: 'unknown'
      };
    }
  }

  private async determineHealthStatus(): Promise<'healthy' | 'warning' | 'critical'> {
    const metrics = this.connectionPool.getMetrics();
    const cacheMetrics = this.cache.getMetrics();

    // Check for critical conditions
    if (metrics.errorCount > 10) return 'critical';
    if (metrics.activeConnections / metrics.totalConnections > 0.9) return 'critical';

    // Check for warning conditions
    if (cacheMetrics.hitRate < this.alertThresholds.cacheHitRatioThreshold / 100) return 'warning';
    if (metrics.averageQueryTime > this.alertThresholds.slowQueryThreshold) return 'warning';

    return 'healthy';
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    return `${days}d ${hours}h ${minutes}m`;
  }

  private async getLastBackupTime(): Promise<string | undefined> {
    // This would depend on your backup strategy
    // For now, return undefined as it's implementation-specific
    return undefined;
  }

  private async getReplicationLag(): Promise<number | undefined> {
    try {
      const result = await this.connectionPool.executeRead(`
        SELECT 
          CASE 
            WHEN pg_is_in_recovery() THEN 
              EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))::int * 1000
            ELSE NULL
          END as lag_ms
      `);

      return result.rows[0]?.lag_ms || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get slow queries analysis
   */
  async getSlowQueries(limit: number = 10): Promise<SlowQuery[]> {
    const result = await this.connectionPool.executeRead(`
      SELECT 
        query,
        calls,
        total_time,
        mean_time,
        rows,
        100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) as hit_percent
      FROM pg_stat_statements
      WHERE mean_time > $1
      ORDER BY mean_time DESC
      LIMIT $2
    `, [this.alertThresholds.slowQueryThreshold, limit]);

    return result.rows.map(row => ({
      query: row.query,
      calls: parseInt(row.calls),
      totalTime: parseFloat(row.total_time),
      meanTime: parseFloat(row.mean_time),
      rows: parseInt(row.rows),
      hitPercent: parseFloat(row.hit_percent || '0')
    }));
  }

  /**
   * Get table statistics
   */
  async getTableStatistics(): Promise<TableStatistics[]> {
    const result = await this.connectionPool.executeRead(`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
        n_live_tup as row_count,
        pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as index_size,
        seq_scan,
        idx_scan,
        n_tup_ins / EXTRACT(EPOCH FROM (now() - stats_reset)) as inserts_per_second,
        n_tup_upd / EXTRACT(EPOCH FROM (now() - stats_reset)) as updates_per_second,
        n_tup_del / EXTRACT(EPOCH FROM (now() - stats_reset)) as deletes_per_second
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    `);

    return result.rows.map(row => ({
      tableName: `${row.schemaname}.${row.tablename}`,
      size: row.size,
      rowCount: parseInt(row.row_count || '0'),
      indexSize: row.index_size,
      sequentialScans: parseInt(row.seq_scan || '0'),
      indexScans: parseInt(row.idx_scan || '0'),
      insertsPerSecond: parseFloat(row.inserts_per_second || '0'),
      updatesPerSecond: parseFloat(row.updates_per_second || '0'),
      deletesPerSecond: parseFloat(row.deletes_per_second || '0')
    }));
  }

  /**
   * Check for alerts and create new ones
   */
  private async checkAlerts(): Promise<void> {
    const metrics = await this.collectMetrics();

    // Check connection utilization
    const connectionUtilization = (metrics.connections.active / metrics.connections.maxConnections) * 100;
    if (connectionUtilization > this.alertThresholds.connectionUtilizationThreshold) {
      this.createAlert({
        type: 'connection',
        severity: connectionUtilization > 95 ? 'critical' : 'warning',
        message: `High connection utilization: ${connectionUtilization.toFixed(1)}%`,
        metadata: { utilization: connectionUtilization }
      });
    }

    // Check cache hit ratio
    if (metrics.performance.cacheHitRatio < this.alertThresholds.cacheHitRatioThreshold) {
      this.createAlert({
        type: 'performance',
        severity: metrics.performance.cacheHitRatio < 80 ? 'critical' : 'warning',
        message: `Low cache hit ratio: ${metrics.performance.cacheHitRatio.toFixed(1)}%`,
        metadata: { cacheHitRatio: metrics.performance.cacheHitRatio }
      });
    }

    // Check for slow queries
    if (metrics.queries.slowQueries > 10) {
      this.createAlert({
        type: 'performance',
        severity: metrics.queries.slowQueries > 50 ? 'critical' : 'warning',
        message: `High number of slow queries: ${metrics.queries.slowQueries}`,
        metadata: { slowQueries: metrics.queries.slowQueries }
      });
    }

    // Check replication lag
    if (metrics.health.replicationLag && metrics.health.replicationLag > this.alertThresholds.replicationLagThreshold) {
      this.createAlert({
        type: 'replication',
        severity: metrics.health.replicationLag > 10000 ? 'critical' : 'warning',
        message: `High replication lag: ${metrics.health.replicationLag}ms`,
        metadata: { replicationLag: metrics.health.replicationLag }
      });
    }
  }

  private createAlert(alert: Omit<SystemAlert, 'id' | 'timestamp' | 'resolved'>): void {
    const newAlert: SystemAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      resolved: false,
      ...alert
    };

    this.alerts.push(newAlert);

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    console.log(`Database alert created: ${newAlert.message}`);
  }

  /**
   * Get current alerts
   */
  getAlerts(includeResolved: boolean = false): SystemAlert[] {
    return includeResolved 
      ? [...this.alerts]
      : this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      return true;
    }
    return false;
  }

  /**
   * Get performance summary for dashboard
   */
  async getPerformanceSummary(): Promise<any> {
    const metrics = await this.collectMetrics();
    const slowQueries = await this.getSlowQueries(5);
    const tableStats = await this.getTableStatistics();
    const activeAlerts = this.getAlerts(false);

    return {
      overview: {
        status: metrics.health.status,
        uptime: metrics.health.uptime,
        connectionsUsed: `${metrics.connections.active}/${metrics.connections.maxConnections}`,
        cacheHitRatio: `${metrics.performance.cacheHitRatio.toFixed(1)}%`,
        averageQueryTime: `${metrics.queries.averageQueryTime.toFixed(2)}ms`
      },
      alerts: {
        total: activeAlerts.length,
        critical: activeAlerts.filter(a => a.severity === 'critical').length,
        warning: activeAlerts.filter(a => a.severity === 'warning').length
      },
      topSlowQueries: slowQueries.slice(0, 3),
      largestTables: tableStats.slice(0, 5),
      timestamp: metrics.timestamp
    };
  }

  /**
   * Export metrics for external monitoring systems
   */
  async exportMetrics(format: 'json' | 'prometheus' = 'json'): Promise<string> {
    const metrics = await this.collectMetrics();

    if (format === 'prometheus') {
      return this.formatPrometheusMetrics(metrics);
    }

    return JSON.stringify(metrics, null, 2);
  }

  private formatPrometheusMetrics(metrics: DatabaseMetrics): string {
    const lines: string[] = [];

    // Connection metrics
    lines.push(`db_connections_total ${metrics.connections.total}`);
    lines.push(`db_connections_active ${metrics.connections.active}`);
    lines.push(`db_connections_idle ${metrics.connections.idle}`);
    lines.push(`db_connections_waiting ${metrics.connections.waiting}`);

    // Query metrics
    lines.push(`db_queries_total ${metrics.queries.totalQueries}`);
    lines.push(`db_query_duration_avg ${metrics.queries.averageQueryTime}`);
    lines.push(`db_slow_queries_total ${metrics.queries.slowQueries}`);
    lines.push(`db_queries_per_second ${metrics.queries.queriesPerSecond}`);

    // Performance metrics
    lines.push(`db_cache_hit_ratio ${metrics.performance.cacheHitRatio}`);
    lines.push(`db_transactions_per_second ${metrics.performance.transactionsPerSecond}`);
    lines.push(`db_blocks_read_total ${metrics.performance.blocksRead}`);
    lines.push(`db_blocks_hit_total ${metrics.performance.blocksHit}`);
    lines.push(`db_deadlocks_total ${metrics.performance.deadlocks}`);

    return lines.join('\n');
  }
}

// Singleton instance
let monitoringServiceInstance: DatabaseMonitoringService | null = null;

export function getDatabaseMonitoring(): DatabaseMonitoringService {
  if (!monitoringServiceInstance) {
    monitoringServiceInstance = new DatabaseMonitoringService();
  }
  
  return monitoringServiceInstance;
}