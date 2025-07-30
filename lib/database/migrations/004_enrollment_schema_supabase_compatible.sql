-- Class Enrollment Flow Database Schema (Supabase Compatible)
-- Migration 004: Enrollment Management System

-- Create classes table if it doesn't exist (for Supabase compatibility)
CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  description TEXT,
  code VARCHAR,
  instructor_id UUID REFERENCES user_profiles(id),
  department_id UUID REFERENCES departments(id),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enhanced classes table with enrollment configuration
ALTER TABLE classes ADD COLUMN IF NOT EXISTS enrollment_config JSONB DEFAULT '{}';
ALTER TABLE classes ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 30;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS current_enrollment INTEGER DEFAULT 0;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS waitlist_capacity INTEGER DEFAULT 10;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS enrollment_type VARCHAR DEFAULT 'open'; -- 'open', 'restricted', 'invitation_only'
ALTER TABLE classes ADD COLUMN IF NOT EXISTS enrollment_start TIMESTAMP;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS enrollment_end TIMESTAMP;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS drop_deadline DATE;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS withdraw_deadline DATE;

-- Student enrollments
CREATE TABLE IF NOT EXISTS enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES user_profiles(id) NOT NULL,
  class_id UUID REFERENCES classes(id) NOT NULL,
  status VARCHAR DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'pending', 'waitlisted', 'dropped', 'withdrawn', 'completed')),
  enrolled_at TIMESTAMP DEFAULT NOW(),
  enrolled_by UUID REFERENCES user_profiles(id), -- For admin enrollments
  drop_deadline DATE,
  withdraw_deadline DATE,
  grade VARCHAR,
  credits NUMERIC DEFAULT 0,
  priority INTEGER DEFAULT 0, -- For priority enrollment
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, class_id)
);

-- Enrollment requests (for restricted classes)
CREATE TABLE IF NOT EXISTS enrollment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES user_profiles(id) NOT NULL,
  class_id UUID REFERENCES classes(id) NOT NULL,
  requested_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'cancelled')),
  reviewed_at TIMESTAMP,
  reviewed_by UUID REFERENCES user_profiles(id),
  review_notes TEXT,
  justification TEXT,
  priority INTEGER DEFAULT 0,
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, class_id, status) -- Prevent duplicate pending requests
);

-- Waitlist management
CREATE TABLE IF NOT EXISTS waitlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES user_profiles(id) NOT NULL,
  class_id UUID REFERENCES classes(id) NOT NULL,
  position INTEGER NOT NULL,
  added_at TIMESTAMP DEFAULT NOW(),
  notified_at TIMESTAMP,
  notification_expires_at TIMESTAMP,
  priority INTEGER DEFAULT 0, -- For priority waitlist placement
  estimated_probability NUMERIC DEFAULT 0.0, -- Enrollment probability estimate
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, class_id)
);

-- Waitlist notifications and responses
CREATE TABLE IF NOT EXISTS waitlist_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  waitlist_entry_id UUID REFERENCES waitlist_entries(id) NOT NULL,
  notification_type VARCHAR NOT NULL CHECK (notification_type IN ('position_change', 'enrollment_available', 'deadline_reminder', 'final_notice')),
  sent_at TIMESTAMP DEFAULT NOW(),
  response_deadline TIMESTAMP,
  responded BOOLEAN DEFAULT FALSE,
  response VARCHAR CHECK (response IN ('accept', 'decline', 'no_response')),
  response_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Class prerequisites
CREATE TABLE IF NOT EXISTS class_prerequisites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES classes(id) NOT NULL,
  type VARCHAR NOT NULL CHECK (type IN ('course', 'grade', 'year', 'major', 'gpa', 'custom')),
  requirement TEXT NOT NULL, -- JSON string for complex requirements
  description TEXT,
  strict BOOLEAN DEFAULT TRUE, -- Whether to enforce automatically
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enrollment restrictions
CREATE TABLE IF NOT EXISTS enrollment_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES classes(id) NOT NULL,
  type VARCHAR NOT NULL CHECK (type IN ('year_level', 'major', 'department', 'gpa', 'institution', 'custom')),
  condition TEXT NOT NULL, -- JSON string for complex conditions
  description TEXT,
  overridable BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enrollment audit log for compliance and tracking
CREATE TABLE IF NOT EXISTS enrollment_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES user_profiles(id) NOT NULL,
  class_id UUID REFERENCES classes(id) NOT NULL,
  action VARCHAR NOT NULL CHECK (action IN ('enrolled', 'dropped', 'withdrawn', 'waitlisted', 'approved', 'denied', 'invited', 'transferred')),
  performed_by UUID REFERENCES user_profiles(id),
  reason TEXT,
  previous_status VARCHAR,
  new_status VARCHAR,
  timestamp TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT
);

-- Class invitations for invitation-only enrollment
CREATE TABLE IF NOT EXISTS class_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES classes(id) NOT NULL,
  student_id UUID REFERENCES user_profiles(id), -- Optional: can invite by email only
  email VARCHAR,
  invited_by UUID REFERENCES user_profiles(id) NOT NULL,
  token VARCHAR UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  declined_at TIMESTAMP,
  message TEXT, -- Custom invitation message
  created_at TIMESTAMP DEFAULT NOW(),
  CHECK (student_id IS NOT NULL OR email IS NOT NULL) -- Must have either student_id or email
);

-- Invitation audit log for tracking invitation actions
CREATE TABLE IF NOT EXISTS invitation_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id UUID REFERENCES class_invitations(id) NOT NULL,
  action VARCHAR NOT NULL CHECK (action IN ('created', 'accepted', 'declined', 'revoked', 'expired')),
  performed_by UUID REFERENCES user_profiles(id),
  timestamp TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT
);

-- Enrollment statistics cache for performance
CREATE TABLE IF NOT EXISTS enrollment_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES classes(id) NOT NULL UNIQUE,
  total_enrolled INTEGER DEFAULT 0,
  total_waitlisted INTEGER DEFAULT 0,
  total_pending INTEGER DEFAULT 0,
  capacity_utilization NUMERIC DEFAULT 0.0,
  average_wait_time INTERVAL,
  enrollment_trend VARCHAR DEFAULT 'stable', -- 'increasing', 'decreasing', 'stable'
  last_updated TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_classes_instructor_id ON classes(instructor_id);
CREATE INDEX IF NOT EXISTS idx_classes_department_id ON classes(department_id);
CREATE INDEX IF NOT EXISTS idx_classes_institution_id ON classes(institution_id);

CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_class ON enrollments(student_id, class_id);

CREATE INDEX IF NOT EXISTS idx_enrollment_requests_student_id ON enrollment_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_requests_class_id ON enrollment_requests(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_requests_status ON enrollment_requests(status);
CREATE INDEX IF NOT EXISTS idx_enrollment_requests_expires_at ON enrollment_requests(expires_at);

CREATE INDEX IF NOT EXISTS idx_waitlist_entries_class_id ON waitlist_entries(class_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_position ON waitlist_entries(class_id, position);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_student_id ON waitlist_entries(student_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_priority ON waitlist_entries(class_id, priority DESC, added_at);

CREATE INDEX IF NOT EXISTS idx_waitlist_notifications_entry_id ON waitlist_notifications(waitlist_entry_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_notifications_response_deadline ON waitlist_notifications(response_deadline);

CREATE INDEX IF NOT EXISTS idx_class_prerequisites_class_id ON class_prerequisites(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_restrictions_class_id ON enrollment_restrictions(class_id);

CREATE INDEX IF NOT EXISTS idx_enrollment_audit_log_student_id ON enrollment_audit_log(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_audit_log_class_id ON enrollment_audit_log(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_audit_log_timestamp ON enrollment_audit_log(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_class_invitations_class_id ON class_invitations(class_id);
CREATE INDEX IF NOT EXISTS idx_class_invitations_token ON class_invitations(token);
CREATE INDEX IF NOT EXISTS idx_class_invitations_expires_at ON class_invitations(expires_at);
CREATE INDEX IF NOT EXISTS idx_class_invitations_student_id ON class_invitations(student_id);
CREATE INDEX IF NOT EXISTS idx_class_invitations_email ON class_invitations(email);

CREATE INDEX IF NOT EXISTS idx_invitation_audit_log_invitation_id ON invitation_audit_log(invitation_id);
CREATE INDEX IF NOT EXISTS idx_invitation_audit_log_timestamp ON invitation_audit_log(timestamp DESC);

-- Enable Row Level Security (RLS) for all tables
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_prerequisites ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_statistics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for classes (public read, instructor/admin write)
CREATE POLICY "Anyone can view classes" ON classes
  FOR SELECT USING (true);

CREATE POLICY "Instructors can manage their classes" ON classes
  FOR ALL USING (
    auth.uid() = instructor_id OR
    EXISTS (
      SELECT 1 FROM user_profiles up 
      JOIN user_role_assignments ura ON up.id = ura.user_id 
      WHERE up.id = auth.uid() 
      AND ura.role IN ('institution_admin', 'department_admin', 'system_admin')
      AND ura.status = 'active'
    )
  );

-- Create RLS policies for enrollments
CREATE POLICY "Students can view own enrollments" ON enrollments
  FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "Students can create own enrollments" ON enrollments
  FOR INSERT WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Instructors can view class enrollments" ON enrollments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM classes c 
      WHERE c.id = enrollments.class_id 
      AND c.instructor_id = auth.uid()
    )
  );

-- Triggers for maintaining enrollment counts and statistics
CREATE OR REPLACE FUNCTION update_enrollment_counts()
RETURNS TRIGGER AS $$
BEGIN
  -- Update current enrollment count in classes table
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'enrolled' THEN
      UPDATE classes 
      SET current_enrollment = current_enrollment + 1 
      WHERE id = NEW.class_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle status changes
    IF OLD.status != NEW.status THEN
      IF OLD.status = 'enrolled' AND NEW.status != 'enrolled' THEN
        UPDATE classes 
        SET current_enrollment = current_enrollment - 1 
        WHERE id = NEW.class_id;
      ELSIF OLD.status != 'enrolled' AND NEW.status = 'enrolled' THEN
        UPDATE classes 
        SET current_enrollment = current_enrollment + 1 
        WHERE id = NEW.class_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'enrolled' THEN
      UPDATE classes 
      SET current_enrollment = current_enrollment - 1 
      WHERE id = OLD.class_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS enrollment_count_trigger ON enrollments;
CREATE TRIGGER enrollment_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION update_enrollment_counts();

-- Function to update waitlist positions
CREATE OR REPLACE FUNCTION update_waitlist_positions()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate positions for the affected class
  WITH numbered_waitlist AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY priority DESC, added_at ASC) as new_position
    FROM waitlist_entries 
    WHERE class_id = COALESCE(NEW.class_id, OLD.class_id)
  )
  UPDATE waitlist_entries 
  SET position = numbered_waitlist.new_position,
      updated_at = NOW()
  FROM numbered_waitlist 
  WHERE waitlist_entries.id = numbered_waitlist.id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create waitlist position trigger
DROP TRIGGER IF EXISTS waitlist_position_trigger ON waitlist_entries;
CREATE TRIGGER waitlist_position_trigger
  AFTER INSERT OR DELETE ON waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION update_waitlist_positions();

-- Function to update enrollment statistics
CREATE OR REPLACE FUNCTION update_enrollment_statistics()
RETURNS TRIGGER AS $$
DECLARE
  class_id_to_update UUID;
BEGIN
  class_id_to_update := COALESCE(NEW.class_id, OLD.class_id);
  
  INSERT INTO enrollment_statistics (class_id, total_enrolled, total_waitlisted, total_pending, capacity_utilization, last_updated)
  SELECT 
    class_id_to_update,
    COALESCE((SELECT COUNT(*) FROM enrollments WHERE class_id = class_id_to_update AND status = 'enrolled'), 0),
    COALESCE((SELECT COUNT(*) FROM waitlist_entries WHERE class_id = class_id_to_update), 0),
    COALESCE((SELECT COUNT(*) FROM enrollment_requests WHERE class_id = class_id_to_update AND status = 'pending'), 0),
    CASE 
      WHEN c.capacity > 0 THEN 
        ROUND((COALESCE((SELECT COUNT(*) FROM enrollments WHERE class_id = class_id_to_update AND status = 'enrolled'), 0)::NUMERIC / c.capacity::NUMERIC) * 100, 2)
      ELSE 0 
    END,
    NOW()
  FROM classes c WHERE c.id = class_id_to_update
  ON CONFLICT (class_id) DO UPDATE SET
    total_enrolled = EXCLUDED.total_enrolled,
    total_waitlisted = EXCLUDED.total_waitlisted,
    total_pending = EXCLUDED.total_pending,
    capacity_utilization = EXCLUDED.capacity_utilization,
    last_updated = EXCLUDED.last_updated;
    
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create statistics update triggers
DROP TRIGGER IF EXISTS enrollment_stats_trigger ON enrollments;
CREATE TRIGGER enrollment_stats_trigger
  AFTER INSERT OR UPDATE OR DELETE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION update_enrollment_statistics();

DROP TRIGGER IF EXISTS waitlist_stats_trigger ON waitlist_entries;
CREATE TRIGGER waitlist_stats_trigger
  AFTER INSERT OR UPDATE OR DELETE ON waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION update_enrollment_statistics();

DROP TRIGGER IF EXISTS request_stats_trigger ON enrollment_requests;
CREATE TRIGGER request_stats_trigger
  AFTER INSERT OR UPDATE OR DELETE ON enrollment_requests
  FOR EACH ROW EXECUTE FUNCTION update_enrollment_statistics();

-- Function to increment class enrollment count (used by invitation acceptance)
CREATE OR REPLACE FUNCTION increment_class_enrollment(class_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE classes 
  SET current_enrollment = current_enrollment + 1 
  WHERE id = class_id;
END;
$$ LANGUAGE plpgsql;

-- Insert some demo classes for testing
INSERT INTO classes (name, code, description, instructor_id, department_id, institution_id, capacity)
SELECT 
  class_data.name,
  class_data.code,
  class_data.description,
  up.id,
  d.id,
  i.id,
  class_data.capacity
FROM institutions i
CROSS JOIN departments d
CROSS JOIN user_profiles up
CROSS JOIN (VALUES 
  ('Introduction to Computer Science', 'CS101', 'Basic programming concepts and problem solving', 30),
  ('Calculus I', 'MATH101', 'Differential and integral calculus', 25),
  ('English Composition', 'ENG101', 'Academic writing and critical thinking', 20),
  ('Business Ethics', 'BUS201', 'Ethical decision making in business', 35)
) AS class_data(name, code, description, capacity)
WHERE i.domain = 'demo.edu' 
  AND d.institution_id = i.id 
  AND d.code IN ('CS', 'MATH', 'ENG', 'BUS')
  AND up.role = 'teacher'
LIMIT 4
ON CONFLICT DO NOTHING;