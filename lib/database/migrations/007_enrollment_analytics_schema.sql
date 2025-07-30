-- Institution policies table
CREATE TABLE IF NOT EXISTS institution_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  name VARCHAR NOT NULL,
  type VARCHAR NOT NULL CHECK (type IN ('enrollment_deadline', 'capacity_limit', 'prerequisite_enforcement', 'waitlist_policy', 'override_policy')),
  description TEXT NOT NULL,
  value TEXT NOT NULL, -- JSON string for complex values
  scope VARCHAR NOT NULL CHECK (scope IN ('institution', 'department', 'course')),
  is_active BOOLEAN DEFAULT TRUE,
  effective_date DATE,
  expiration_date DATE,
  modified_by VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Conflict resolutions table
CREATE TABLE IF NOT EXISTS conflict_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conflict_id VARCHAR NOT NULL,
  resolution_type VARCHAR NOT NULL CHECK (resolution_type IN ('manual_override', 'capacity_increase', 'student_transfer', 'policy_exception', 'dismiss')),
  description TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  resolved_by VARCHAR NOT NULL,
  resolved_at TIMESTAMP NOT NULL,
  affected_students TEXT[], -- Array of student IDs
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enrollment overrides table
CREATE TABLE IF NOT EXISTS enrollment_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL,
  class_id UUID REFERENCES classes(id) NOT NULL,
  override_type VARCHAR NOT NULL CHECK (override_type IN ('enrollment_override', 'prerequisite_override', 'capacity_override', 'deadline_override')),
  reason TEXT NOT NULL,
  requested_by VARCHAR NOT NULL,
  approved_by VARCHAR,
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  requested_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  expires_at TIMESTAMP,
  conditions TEXT[],
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Analytics cache table for performance
CREATE TABLE IF NOT EXISTS enrollment_analytics_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  timeframe VARCHAR NOT NULL,
  analytics_data JSONB NOT NULL,
  generated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  UNIQUE(institution_id, timeframe)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_institution_policies_institution_id ON institution_policies(institution_id);
CREATE INDEX IF NOT EXISTS idx_institution_policies_type ON institution_policies(type);
CREATE INDEX IF NOT EXISTS idx_institution_policies_active ON institution_policies(is_active);

CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_conflict_id ON conflict_resolutions(conflict_id);
CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_resolved_by ON conflict_resolutions(resolved_by);
CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_resolved_at ON conflict_resolutions(resolved_at);

CREATE INDEX IF NOT EXISTS idx_enrollment_overrides_student_id ON enrollment_overrides(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_overrides_class_id ON enrollment_overrides(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_overrides_status ON enrollment_overrides(status);
CREATE INDEX IF NOT EXISTS idx_enrollment_overrides_requested_at ON enrollment_overrides(requested_at);

CREATE INDEX IF NOT EXISTS idx_analytics_cache_institution_timeframe ON enrollment_analytics_cache(institution_id, timeframe);
CREATE INDEX IF NOT EXISTS idx_analytics_cache_expires_at ON enrollment_analytics_cache(expires_at);

-- Function to clean up expired analytics cache
CREATE OR REPLACE FUNCTION cleanup_expired_analytics_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM enrollment_analytics_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_institution_policies_updated_at
  BEFORE UPDATE ON institution_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_enrollment_overrides_updated_at
  BEFORE UPDATE ON enrollment_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();