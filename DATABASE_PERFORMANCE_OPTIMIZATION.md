# Database Performance Optimization Implementation

This document describes the comprehensive database performance optimization system implemented for the application.

## Overview

The database performance optimization includes:

1. **Advanced Redis Caching** - Multi-layer caching with intelligent invalidation
2. **Query Optimization** - Indexes, query analysis, and performance monitoring
3. **Table Partitioning** - Automated partitioning for large tables
4. **Connection Pooling** - Load balancing and connection management
5. **Performance Monitoring** - Real-time metrics and alerting
6. **Stress Testing** - Comprehensive load and performance testing

## Components Implemented

### 1. Redis Cache Service (`lib/services/redis-cache-service.ts`)

**Features:**
- Connection pooling and error handling
- Automatic JSON serialization/deserialization
- Batch operations (mget, mset)
- Cache metrics and hit rate tracking
- Key generation with hashing for complex objects
- TTL management and expiration

**Usage:**
```typescript
import { getCacheService } from '@/lib/services/redis-cache-service';

const cache = getCacheService();
await cache.set('user:123', userData, 3600); // 1 hour TTL
const user = await cache.get('user:123');
```

### 2. Cache Strategy Service (`lib/services/cache-strategy-service.ts`)

**Features:**
- Application-specific caching patterns
- User profile and institution caching
- Class and enrollment caching
- Analytics data caching
- Cache warming and invalidation strategies

**Usage:**
```typescript
import { getCacheStrategy } from '@/lib/services/cache-strategy-service';

const strategy = getCacheStrategy();
await strategy.cacheUserProfile(userId);
const profile = await strategy.getUserProfile(userId);
```

### 3. Database Connection Pool (`lib/services/database-connection-pool.ts`)

**Features:**
- Primary/replica connection management
- Load balancing across read replicas
- Connection health monitoring
- Automatic failover and recovery
- Transaction support
- Connection metrics and monitoring

**Usage:**
```typescript
import { getConnectionPool } from '@/lib/services/database-connection-pool';

const pool = getConnectionPool();
const result = await pool.executeRead('SELECT * FROM users WHERE id = $1', [userId]);
await pool.executeWrite('INSERT INTO users (email) VALUES ($1)', [email]);
```

### 4. Query Optimization (`lib/database/query-optimization.sql`)

**Features:**
- Comprehensive indexing strategy
- Partial indexes for specific conditions
- Composite indexes for complex queries
- Query performance analysis functions
- Maintenance procedures
- Performance monitoring views

**Key Indexes:**
- User lookup indexes (email, institution, role)
- Class and enrollment indexes
- Assignment and submission indexes
- Notification indexes
- Analytics and metrics indexes

### 5. Table Partitioning (`lib/database/table-partitioning.sql`)

**Features:**
- Monthly partitioning for time-series data
- Automated partition creation and cleanup
- Partition-aware indexing
- Monitoring and maintenance functions

**Partitioned Tables:**
- `system_metrics` - Performance metrics data
- `user_interactions` - User activity tracking
- `notifications_partitioned` - Notification history

### 6. Database Monitoring (`lib/services/database-monitoring-service.ts`)

**Features:**
- Real-time performance metrics collection
- Slow query detection and analysis
- Connection pool monitoring
- System health assessment
- Alert generation and management
- Performance trend analysis

**Metrics Tracked:**
- Connection utilization
- Query performance (average time, slow queries)
- Cache hit ratios
- Database size and growth
- Transaction rates
- Error rates and deadlocks

### 7. Performance Dashboard (`components/database/performance-dashboard.tsx`)

**Features:**
- Real-time performance visualization
- System health overview
- Active alerts management
- Slow query analysis
- Connection pool status
- Cache performance metrics

**Access:** `/dashboard/admin/database-performance`

### 8. Performance Testing (`__tests__/performance/database-performance.test.ts`)

**Test Categories:**
- Connection pool performance
- Query execution performance
- Cache performance
- Load testing
- Stress testing
- Monitoring performance

### 9. Stress Testing Script (`scripts/database-stress-test.js`)

**Features:**
- Configurable load patterns
- Multiple concurrent user simulation
- Query type distribution
- Performance threshold validation
- Comprehensive reporting
- Automated cleanup

## Configuration

### Environment Variables

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=app:
REDIS_DEFAULT_TTL=3600

# Database Pool Configuration
DB_HOST=your-db-host
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your-password
DB_SSL=true
DB_POOL_MIN=2
DB_POOL_MAX=20
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=5000
DB_ACQUIRE_TIMEOUT=10000

# Health Check Configuration
DB_HEALTH_CHECK_ENABLED=true
DB_HEALTH_CHECK_INTERVAL=30000
DB_HEALTH_CHECK_TIMEOUT=5000
DB_HEALTH_CHECK_RETRIES=3

# Performance Monitoring
ENABLE_PERFORMANCE_MONITORING=true
PERFORMANCE_MONITORING_INTERVAL=60000
```

### Database Setup

1. **Error-Free Setup (Recommended):**
```bash
# Simple, error-free setup that works with your actual schema
psql -d your_database -f scripts/setup-database-performance-simple.sql
```

2. **For Production - Create Concurrent Indexes:**
```bash
# Run this separately after the main setup, outside of transactions
psql -d your_database -f lib/database/create-indexes-concurrent.sql
```

3. **Safe Query Optimization Only:**
```bash
# Just the verified indexes and functions
psql -d your_database -f lib/database/query-optimization-safe.sql
```

3. **Manual Setup (Alternative):**
```bash
# Step by step setup
psql -d your_database -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"
psql -d your_database -f lib/database/query-optimization.sql
psql -d your_database -f lib/database/table-partitioning.sql
```

**Important Notes:**
- The main setup script creates basic indexes that work in transactions
- For production, use the concurrent index creation script for better performance
- Concurrent index creation cannot run inside transactions

## Usage

### 1. Install Dependencies

```bash
npm install ioredis pg @types/pg
```

### 2. Setup Redis

```bash
# Using Docker
docker run -d --name redis -p 6379:6379 redis:alpine

# Or install locally
# macOS: brew install redis
# Ubuntu: sudo apt-get install redis-server
```

### 3. Run Performance Tests

```bash
# Unit tests
npm run test:performance

# Stress testing
npm run stress-test
```

### 4. Monitor Performance

Visit `/dashboard/admin/database-performance` to view real-time metrics.

### 5. API Endpoints

- `GET /api/database/performance` - Get performance metrics
- `GET /api/database/performance?format=prometheus` - Prometheus metrics
- `POST /api/database/performance` - Analyze queries, reset metrics, resolve alerts

## Performance Optimizations Implemented

### 1. Caching Strategy

- **User Data:** Profile, roles, and permissions cached for 30 minutes
- **Institution Data:** Organization info cached for 1 hour
- **Class Data:** Enrollment and class info cached for 15 minutes
- **Analytics:** Query results cached for 5 minutes
- **System Health:** Cached for 1 minute

### 2. Database Indexes

- **Primary Lookups:** Email, user ID, class codes
- **Composite Indexes:** Multi-column queries (user + institution, class + status)
- **Partial Indexes:** Active records only, specific conditions
- **Covering Indexes:** Include frequently accessed columns

### 3. Connection Management

- **Pool Sizing:** 2-20 connections based on load
- **Read Replicas:** Load balancing for read operations
- **Health Checks:** Automatic failover and recovery
- **Connection Reuse:** Efficient connection lifecycle management

### 4. Query Optimization

- **Prepared Statements:** Parameterized queries for security and performance
- **Query Analysis:** EXPLAIN ANALYZE for slow query identification
- **Index Usage:** Monitoring and optimization recommendations
- **Query Caching:** Result caching for expensive operations

## Monitoring and Alerting

### Alerts Generated For:

- **High Connection Utilization** (>80%)
- **Low Cache Hit Ratio** (<90%)
- **Slow Queries** (>1000ms average)
- **High Error Rate** (>5%)
- **Replication Lag** (>5 seconds)

### Metrics Exported:

- Connection pool statistics
- Query performance metrics
- Cache hit rates and response times
- Database size and growth
- System resource utilization

## Performance Benchmarks

### Expected Performance:

- **Simple Queries:** <50ms average
- **Complex Joins:** <1000ms average
- **Cache Operations:** <10ms average
- **Connection Acquisition:** <100ms
- **Throughput:** >100 requests/second

### Load Testing Results:

- **Concurrent Users:** Tested up to 100 users
- **Sustained Load:** 30-second tests at various RPS
- **Error Rate:** <5% under normal load
- **Response Time:** 95th percentile <2000ms

## Maintenance

### Daily Tasks:
- Monitor performance dashboard
- Review slow query alerts
- Check cache hit rates

### Weekly Tasks:
- Analyze performance trends
- Review and resolve alerts
- Update table statistics

### Monthly Tasks:
- Partition maintenance
- Index analysis and optimization
- Performance baseline review

## Troubleshooting

### Common Issues:

1. **High Memory Usage**
   - Check Redis memory usage
   - Review cache TTL settings
   - Monitor connection pool size

2. **Slow Queries**
   - Check missing indexes
   - Analyze query execution plans
   - Review table statistics

3. **Connection Pool Exhaustion**
   - Increase pool size
   - Check for connection leaks
   - Review query timeout settings

4. **Cache Misses**
   - Verify Redis connectivity
   - Check cache key patterns
   - Review invalidation logic

### Performance Debugging:

```bash
# Check slow queries
SELECT query, mean_time, calls FROM pg_stat_statements 
WHERE mean_time > 1000 ORDER BY mean_time DESC;

# Monitor connections
SELECT count(*), state FROM pg_stat_activity GROUP BY state;

# Check cache metrics
curl http://localhost:3000/api/database/performance
```

### SQL Error Troubleshooting:

**Error: "CREATE INDEX CONCURRENTLY cannot run inside a transaction block"**
- Solution: Use `lib/database/create-indexes-concurrent.sql` outside of transactions
- Or use the main `query-optimization.sql` which uses regular CREATE INDEX

**Error: "column 'tablename' does not exist"**
- Solution: Updated to use proper system catalog queries in `table-partitioning.sql`
- The views now use `pg_class` and `pg_namespace` instead of `pg_tables`

**Error: "relation does not exist"**
- Solution: Ensure tables exist before creating indexes
- Use the error-free setup script: `scripts/setup-database-performance-simple.sql`

**Error: "syntax error at or near \echo"**
- Solution: `\echo` and `\i` commands don't work in regular SQL
- Use the simple setup script which uses only standard SQL

**Error: "column 'status' does not exist"**
- Solution: Not all tables have status columns
- Use `query-optimization-safe.sql` which only references verified columns

## Security Considerations

- **Connection Strings:** Stored securely in environment variables
- **Redis Access:** Password protection and network isolation
- **Query Injection:** All queries use parameterized statements
- **Access Control:** Performance endpoints require admin access
- **Data Encryption:** SSL/TLS for all database connections

## Future Enhancements

1. **Advanced Caching:** Implement cache warming strategies
2. **Query Optimization:** Machine learning-based query optimization
3. **Horizontal Scaling:** Database sharding implementation
4. **Real-time Analytics:** Stream processing for metrics
5. **Automated Tuning:** Self-optimizing database parameters

This implementation provides a robust foundation for database performance optimization with comprehensive monitoring, caching, and testing capabilities.