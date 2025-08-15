import { Pool, PoolClient, PoolConfig } from 'pg';
import { createClient } from '@supabase/supabase-js';

export interface ConnectionPoolConfig {
  // Primary database configuration
  primary: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
  };
  
  // Read replica configuration (optional)
  replicas?: Array<{
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
    weight?: number; // Load balancing weight
  }>;
  
  // Pool configuration
  pool: {
    min: number;
    max: number;
    idleTimeoutMillis: number;
    connectionTimeoutMillis: number;
    acquireTimeoutMillis: number;
  };
  
  // Health check configuration
  healthCheck: {
    enabled: boolean;
    intervalMs: number;
    timeoutMs: number;
    retries: number;
  };
}

export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingClients: number;
  totalQueries: number;
  averageQueryTime: number;
  errorCount: number;
  lastError?: string;
}

export interface DatabaseConnection {
  query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }>;
  release(): void;
}

export class DatabaseConnectionPool {
  private primaryPool: Pool;
  private replicaPools: Pool[] = [];
  private replicaWeights: number[] = [];
  private metrics: ConnectionMetrics;
  private healthCheckInterval?: NodeJS.Timeout;
  private config: ConnectionPoolConfig;

  constructor(config: ConnectionPoolConfig) {
    this.config = config;
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingClients: 0,
      totalQueries: 0,
      averageQueryTime: 0,
      errorCount: 0
    };

    this.initializePools();
    this.setupHealthChecks();
  }

  private initializePools(): void {
    // Initialize primary pool
    const primaryConfig: PoolConfig = {
      host: this.config.primary.host,
      port: this.config.primary.port,
      database: this.config.primary.database,
      user: this.config.primary.user,
      password: this.config.primary.password,
      ssl: this.config.primary.ssl,
      min: this.config.pool.min,
      max: this.config.pool.max,
      idleTimeoutMillis: this.config.pool.idleTimeoutMillis,
      connectionTimeoutMillis: this.config.pool.connectionTimeoutMillis,
      acquireTimeoutMillis: this.config.pool.acquireTimeoutMillis,
      application_name: 'app_primary_pool'
    };

    this.primaryPool = new Pool(primaryConfig);
    this.setupPoolEventHandlers(this.primaryPool, 'primary');

    // Initialize replica pools
    if (this.config.replicas) {
      this.config.replicas.forEach((replica, index) => {
        const replicaConfig: PoolConfig = {
          host: replica.host,
          port: replica.port,
          database: replica.database,
          user: replica.user,
          password: replica.password,
          ssl: replica.ssl,
          min: Math.floor(this.config.pool.min / 2), // Fewer connections for replicas
          max: Math.floor(this.config.pool.max / 2),
          idleTimeoutMillis: this.config.pool.idleTimeoutMillis,
          connectionTimeoutMillis: this.config.pool.connectionTimeoutMillis,
          acquireTimeoutMillis: this.config.pool.acquireTimeoutMillis,
          application_name: `app_replica_pool_${index}`
        };

        const replicaPool = new Pool(replicaConfig);
        this.replicaPools.push(replicaPool);
        this.replicaWeights.push(replica.weight || 1);
        this.setupPoolEventHandlers(replicaPool, `replica_${index}`);
      });
    }
  }

  private setupPoolEventHandlers(pool: Pool, poolName: string): void {
    pool.on('connect', (client) => {
      console.log(`New client connected to ${poolName} pool`);
      this.updateConnectionMetrics();
    });

    pool.on('acquire', (client) => {
      console.log(`Client acquired from ${poolName} pool`);
      this.updateConnectionMetrics();
    });

    pool.on('release', (client) => {
      console.log(`Client released to ${poolName} pool`);
      this.updateConnectionMetrics();
    });

    pool.on('error', (err, client) => {
      console.error(`Database pool error in ${poolName}:`, err);
      this.metrics.errorCount++;
      this.metrics.lastError = err.message;
    });

    pool.on('remove', (client) => {
      console.log(`Client removed from ${poolName} pool`);
      this.updateConnectionMetrics();
    });
  }

  private setupHealthChecks(): void {
    if (!this.config.healthCheck.enabled) return;

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheck.intervalMs);
  }

  private async performHealthChecks(): Promise<void> {
    const healthCheckQuery = 'SELECT 1 as health_check';
    const timeout = this.config.healthCheck.timeoutMs;

    // Check primary pool
    try {
      const client = await this.primaryPool.connect();
      const startTime = Date.now();
      
      await Promise.race([
        client.query(healthCheckQuery),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), timeout)
        )
      ]);
      
      client.release();
      console.log(`Primary pool health check passed (${Date.now() - startTime}ms)`);
    } catch (error) {
      console.error('Primary pool health check failed:', error);
      this.metrics.errorCount++;
    }

    // Check replica pools
    for (let i = 0; i < this.replicaPools.length; i++) {
      try {
        const client = await this.replicaPools[i].connect();
        const startTime = Date.now();
        
        await Promise.race([
          client.query(healthCheckQuery),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), timeout)
          )
        ]);
        
        client.release();
        console.log(`Replica ${i} pool health check passed (${Date.now() - startTime}ms)`);
      } catch (error) {
        console.error(`Replica ${i} pool health check failed:`, error);
        this.metrics.errorCount++;
      }
    }
  }

  /**
   * Get a connection for write operations (always uses primary)
   */
  async getWriteConnection(): Promise<DatabaseConnection> {
    const client = await this.primaryPool.connect();
    return this.wrapClient(client);
  }

  /**
   * Get a connection for read operations (uses load balancing across replicas)
   */
  async getReadConnection(): Promise<DatabaseConnection> {
    // If no replicas configured, use primary
    if (this.replicaPools.length === 0) {
      const client = await this.primaryPool.connect();
      return this.wrapClient(client);
    }

    // Select replica using weighted round-robin
    const selectedReplicaIndex = this.selectReplica();
    const client = await this.replicaPools[selectedReplicaIndex].connect();
    return this.wrapClient(client);
  }

  /**
   * Execute a write query (uses primary database)
   */
  async executeWrite<T = any>(query: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
    const connection = await this.getWriteConnection();
    try {
      const startTime = Date.now();
      const result = await connection.query<T>(query, params);
      
      this.updateQueryMetrics(Date.now() - startTime);
      return result;
    } finally {
      connection.release();
    }
  }

  /**
   * Execute a read query (uses load-balanced replicas)
   */
  async executeRead<T = any>(query: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
    const connection = await this.getReadConnection();
    try {
      const startTime = Date.now();
      const result = await connection.query<T>(query, params);
      
      this.updateQueryMetrics(Date.now() - startTime);
      return result;
    } finally {
      connection.release();
    }
  }

  /**
   * Execute a transaction (always uses primary)
   */
  async executeTransaction<T>(
    callback: (connection: DatabaseConnection) => Promise<T>
  ): Promise<T> {
    const connection = await this.getWriteConnection();
    
    try {
      await connection.query('BEGIN');
      const result = await callback(connection);
      await connection.query('COMMIT');
      return result;
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }
  }

  private selectReplica(): number {
    // Simple weighted round-robin selection
    // In production, you might want more sophisticated load balancing
    const totalWeight = this.replicaWeights.reduce((sum, weight) => sum + weight, 0);
    const random = Math.random() * totalWeight;
    
    let currentWeight = 0;
    for (let i = 0; i < this.replicaWeights.length; i++) {
      currentWeight += this.replicaWeights[i];
      if (random <= currentWeight) {
        return i;
      }
    }
    
    return 0; // Fallback to first replica
  }

  private wrapClient(client: PoolClient): DatabaseConnection {
    return {
      query: async <T = any>(text: string, params?: any[]) => {
        const result = await client.query(text, params);
        return {
          rows: result.rows as T[],
          rowCount: result.rowCount || 0
        };
      },
      release: () => client.release()
    };
  }

  private updateConnectionMetrics(): void {
    this.metrics.totalConnections = this.primaryPool.totalCount;
    this.metrics.activeConnections = this.primaryPool.totalCount - this.primaryPool.idleCount;
    this.metrics.idleConnections = this.primaryPool.idleCount;
    this.metrics.waitingClients = this.primaryPool.waitingCount;
  }

  private updateQueryMetrics(queryTime: number): void {
    this.metrics.totalQueries++;
    
    // Calculate rolling average
    this.metrics.averageQueryTime = 
      (this.metrics.averageQueryTime * (this.metrics.totalQueries - 1) + queryTime) / 
      this.metrics.totalQueries;
  }

  /**
   * Get current connection pool metrics
   */
  getMetrics(): ConnectionMetrics {
    this.updateConnectionMetrics();
    return { ...this.metrics };
  }

  /**
   * Get detailed pool statistics
   */
  async getPoolStatistics(): Promise<any> {
    const primaryStats = {
      totalCount: this.primaryPool.totalCount,
      idleCount: this.primaryPool.idleCount,
      waitingCount: this.primaryPool.waitingCount
    };

    const replicaStats = this.replicaPools.map((pool, index) => ({
      index,
      weight: this.replicaWeights[index],
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount
    }));

    return {
      primary: primaryStats,
      replicas: replicaStats,
      metrics: this.getMetrics(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Close all connections and clean up
   */
  async close(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    await this.primaryPool.end();
    
    for (const replicaPool of this.replicaPools) {
      await replicaPool.end();
    }

    console.log('All database connection pools closed');
  }
}

// Singleton instance
let connectionPoolInstance: DatabaseConnectionPool | null = null;

export function getConnectionPool(): DatabaseConnectionPool {
  if (!connectionPoolInstance) {
    const config: ConnectionPoolConfig = {
      primary: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'postgres',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true'
      },
      replicas: process.env.DB_REPLICAS ? JSON.parse(process.env.DB_REPLICAS) : undefined,
      pool: {
        min: parseInt(process.env.DB_POOL_MIN || '2'),
        max: parseInt(process.env.DB_POOL_MAX || '20'),
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000'),
        acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '10000')
      },
      healthCheck: {
        enabled: process.env.DB_HEALTH_CHECK_ENABLED !== 'false',
        intervalMs: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL || '30000'),
        timeoutMs: parseInt(process.env.DB_HEALTH_CHECK_TIMEOUT || '5000'),
        retries: parseInt(process.env.DB_HEALTH_CHECK_RETRIES || '3')
      }
    };

    connectionPoolInstance = new DatabaseConnectionPool(config);
  }

  return connectionPoolInstance;
}

// Supabase connection pool wrapper
export class SupabaseConnectionManager {
  private supabaseClients: Map<string, any> = new Map();
  private clientMetrics: Map<string, { queries: number; errors: number; lastUsed: Date }> = new Map();

  /**
   * Get or create a Supabase client for a specific use case
   */
  getClient(clientType: 'admin' | 'service' | 'user' = 'service'): any {
    const clientKey = `${clientType}_${process.env.NODE_ENV}`;
    
    if (!this.supabaseClients.has(clientKey)) {
      const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        this.getServiceKey(clientType),
        {
          auth: {
            autoRefreshToken: clientType !== 'admin',
            persistSession: clientType === 'user'
          },
          db: {
            schema: 'public'
          },
          global: {
            headers: {
              'x-client-type': clientType
            }
          }
        }
      );

      this.supabaseClients.set(clientKey, client);
      this.clientMetrics.set(clientKey, {
        queries: 0,
        errors: 0,
        lastUsed: new Date()
      });
    }

    // Update last used timestamp
    const metrics = this.clientMetrics.get(clientKey)!;
    metrics.lastUsed = new Date();

    return this.supabaseClients.get(clientKey);
  }

  private getServiceKey(clientType: string): string {
    switch (clientType) {
      case 'admin':
        return process.env.SUPABASE_SERVICE_ROLE_KEY!;
      case 'service':
        return process.env.SUPABASE_SERVICE_ROLE_KEY!;
      case 'user':
        return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      default:
        return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    }
  }

  /**
   * Track query metrics
   */
  trackQuery(clientType: string, success: boolean): void {
    const clientKey = `${clientType}_${process.env.NODE_ENV}`;
    const metrics = this.clientMetrics.get(clientKey);
    
    if (metrics) {
      metrics.queries++;
      if (!success) {
        metrics.errors++;
      }
    }
  }

  /**
   * Get client metrics
   */
  getClientMetrics(): any {
    const metrics: any = {};
    
    this.clientMetrics.forEach((metric, clientKey) => {
      metrics[clientKey] = {
        ...metric,
        errorRate: metric.queries > 0 ? (metric.errors / metric.queries) * 100 : 0
      };
    });

    return metrics;
  }

  /**
   * Clean up unused clients
   */
  cleanup(): void {
    const now = new Date();
    const maxIdleTime = 30 * 60 * 1000; // 30 minutes

    this.clientMetrics.forEach((metrics, clientKey) => {
      if (now.getTime() - metrics.lastUsed.getTime() > maxIdleTime) {
        this.supabaseClients.delete(clientKey);
        this.clientMetrics.delete(clientKey);
        console.log(`Cleaned up idle Supabase client: ${clientKey}`);
      }
    });
  }
}

// Singleton instance for Supabase connection manager
let supabaseManagerInstance: SupabaseConnectionManager | null = null;

export function getSupabaseManager(): SupabaseConnectionManager {
  if (!supabaseManagerInstance) {
    supabaseManagerInstance = new SupabaseConnectionManager();
  }
  
  return supabaseManagerInstance;
}