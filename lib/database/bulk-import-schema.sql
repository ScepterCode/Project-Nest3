-- Enhanced bulk import tracking schema
-- This extends the existing database with tables for comprehensive bulk import functionality

-- Bulk import tracking table
CREATE TABLE IF NOT EXISTS public.bulk_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  initiated_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  file_type VARCHAR(20) NOT NULL CHECK (file_type IN ('csv', 'excel', 'json')),
  total_records INTEGER NOT NULL DEFAULT 0,
  processed_records INTEGER DEFAULT 0,
  successful_records INTEGER DEFAULT 0,
  failed_records INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'cancelled', 'validating')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_report JSONB DEFAULT '{}',
  validation_report JSONB DEFAULT '{}',
  import_options JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Import error tracking table
CREATE TABLE IF NOT EXISTS public.import_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES bulk_imports(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  error_type VARCHAR(100) NOT NULL,
  error_message TEXT NOT NULL,
  field_name VARCHAR(100),
  field_value TEXT,
  raw_data JSONB NOT NULL,
  suggested_fix TEXT,
  is_fixable BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Import warnings tracking table
CREATE TABLE IF NOT EXISTS public.import_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES bulk_imports(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  warning_type VARCHAR(100) NOT NULL,
  warning_message TEXT NOT NULL,
  field_name VARCHAR(100),
  field_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Import progress tracking table
CREATE TABLE IF NOT EXISTS public.import_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES bulk_imports(id) ON DELETE CASCADE,
  stage VARCHAR(100) NOT NULL,
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER DEFAULT 0,
  progress_percentage DECIMAL(5,2) DEFAULT 0.00,
  status_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration snapshots for rollback functionality
CREATE TABLE IF NOT EXISTS public.migration_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  import_id UUID REFERENCES bulk_imports(id) ON DELETE CASCADE,
  snapshot_type VARCHAR(50) NOT NULL CHECK (snapshot_type IN ('user_import', 'course_import', 'full_migration')),
  original_data JSONB NOT NULL,
  imported_records JSONB DEFAULT '[]',
  rollback_data JSONB DEFAULT '{}',
  is_rolled_back BOOLEAN DEFAULT false,
  rollback_date TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Import notifications table
CREATE TABLE IF NOT EXISTS public.import_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES bulk_imports(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(20) NOT NULL CHECK (notification_type IN ('started', 'completed', 'failed', 'warning')),
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  delivery_status VARCHAR(20) DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Bulk imports indexes
CREATE INDEX IF NOT EXISTS idx_bulk_imports_status_institution ON bulk_imports(status, institution_id, started_at);
CREATE INDEX IF NOT EXISTS idx_bulk_imports_initiated_by ON bulk_imports(initiated_by, started_at DESC);

-- Import errors indexes
CREATE INDEX IF NOT EXISTS idx_import_errors_import_row ON import_errors(import_id, row_number);

-- Import warnings indexes
CREATE INDEX IF NOT EXISTS idx_import_warnings_import_row ON import_warnings(import_id, row_number);

-- Import progress indexes
CREATE INDEX IF NOT EXISTS idx_import_progress_import ON import_progress(import_id, updated_at DESC);

-- Migration snapshots indexes
CREATE INDEX IF NOT EXISTS idx_migration_snapshots_institution ON migration_snapshots(institution_id, created_at DESC);

-- Import notifications indexes
CREATE INDEX IF NOT EXISTS idx_import_notifications_recipient ON import_notifications(recipient_id, created_at DESC);

-- RLS policies for security
ALTER TABLE bulk_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_notifications ENABLE ROW LEVEL SECURITY;

-- Policies for bulk_imports
CREATE POLICY "Users can view their institution's bulk imports" ON bulk_imports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.institution_id = bulk_imports.institution_id
    )
  );

CREATE POLICY "Institution admins can manage bulk imports" ON bulk_imports
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.institution_id = bulk_imports.institution_id
      AND users.role IN ('institution_admin', 'department_admin')
    )
  );

-- Policies for import_errors
CREATE POLICY "Users can view errors for their institution's imports" ON import_errors
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bulk_imports bi
      JOIN users u ON u.id = auth.uid()
      WHERE bi.id = import_errors.import_id
      AND u.institution_id = bi.institution_id
    )
  );

-- Policies for import_warnings
CREATE POLICY "Users can view warnings for their institution's imports" ON import_warnings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bulk_imports bi
      JOIN users u ON u.id = auth.uid()
      WHERE bi.id = import_warnings.import_id
      AND u.institution_id = bi.institution_id
    )
  );

-- Policies for import_progress
CREATE POLICY "Users can view progress for their institution's imports" ON import_progress
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bulk_imports bi
      JOIN users u ON u.id = auth.uid()
      WHERE bi.id = import_progress.import_id
      AND u.institution_id = bi.institution_id
    )
  );

-- Policies for migration_snapshots
CREATE POLICY "Institution admins can manage snapshots" ON migration_snapshots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.institution_id = migration_snapshots.institution_id
      AND users.role IN ('institution_admin', 'department_admin')
    )
  );

-- Policies for import_notifications
CREATE POLICY "Users can view their own import notifications" ON import_notifications
  FOR SELECT USING (recipient_id = auth.uid());

-- Functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_bulk_imports_updated_at 
  BEFORE UPDATE ON bulk_imports 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_import_progress_updated_at 
  BEFORE UPDATE ON import_progress 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-
- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant necessary permissions to authenticated users
GRANT ALL ON bulk_imports TO authenticated;
GRANT ALL ON import_errors TO authenticated;
GRANT ALL ON import_warnings TO authenticated;
GRANT ALL ON import_progress TO authenticated;
GRANT ALL ON migration_snapshots TO authenticated;
GRANT ALL ON import_notifications TO authenticated;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION update_updated_at_column() TO authenticated;