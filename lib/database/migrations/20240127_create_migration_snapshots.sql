-- Migration snapshots table for rollback functionality
CREATE TABLE migration_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  type VARCHAR NOT NULL CHECK (type IN ('user_import', 'course_import', 'full_migration')),
  timestamp TIMESTAMP DEFAULT NOW(),
  original_data JSONB NOT NULL DEFAULT '[]',
  imported_records TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Import logs table for tracking import operations
CREATE TABLE import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  type VARCHAR NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_migration_snapshots_institution_id ON migration_snapshots(institution_id);
CREATE INDEX idx_migration_snapshots_type ON migration_snapshots(type);
CREATE INDEX idx_migration_snapshots_timestamp ON migration_snapshots(timestamp);
CREATE INDEX idx_import_logs_institution_id ON import_logs(institution_id);
CREATE INDEX idx_import_logs_type ON import_logs(type);
CREATE INDEX idx_import_logs_created_at ON import_logs(created_at);