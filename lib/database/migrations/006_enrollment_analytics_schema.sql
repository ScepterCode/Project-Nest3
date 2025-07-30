-- Enrollment conflicts tracking
CREATE TABLE enrollment_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  student_id UUID REFERENCES users(id) NOT NULL,
  class_id UUID REFERENCES classes(id) NOT NULL,
  type VARCHAR NOT NULL CHECK (type IN ('capacity_exceeded', 'prerequisite_violation', 'schedule_conflict', 'duplicate_enrollment')),
  description TEXT NOT NULL,
  severity VARCHAR DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by UUID REFERENCES users(id),
  resolution TEXT,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Institution enrollment policies
CREATE TABLE institution_enrollment_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) UNIQUE NOT NULL,
  enrollment_deadline DATE,
  drop_deadline DATE,
  withdraw_deadline DATE,
  max_enrollments_per_student INTEGER DEFAULT 6,
  allow_waitlist_overrides BOOLEAN DEFAULT TRUE,
  require_approval_for_overrides BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enrollment override log
CREATE TABLE enrollment_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL,
  class_id UUID REFERENCES classes(id) NOT NULL,
  override_type VARCHAR NOT NULL CHECK (override_type IN ('capacity', 'prerequisite', 'restriction')),
  reason TEXT NOT NULL,
  performed_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_enrollment_conflicts_institution ON enrollment_conflicts(institution_id);
CREATE INDEX idx_enrollment_conflicts_resolved ON enrollment_conflicts(resolved, created_at);
CREATE INDEX idx_enrollment_conflicts_severity ON enrollment_conflicts(severity);
CREATE INDEX idx_enrollment_overrides_student ON enrollment_overrides(student_id);
CREATE INDEX idx_enrollment_overrides_class ON enrollment_overrides(class_id);
CREATE INDEX idx_enrollment_overrides_performed_by ON enrollment_overrides(performed_by);

-- Function to get enrollment trends
CREATE OR REPLACE FUNCTION get_enrollment_trends(
  institution_id UUID,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  date_format TEXT DEFAULT 'YYYY-MM-DD'
)
RETURNS TABLE (
  period TEXT,
  total_enrollments BIGINT,
  total_requests BIGINT,
  approval_rate NUMERIC,
  capacity_utilization NUMERIC,
  waitlist_size BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(
      date_trunc('day', start_date::DATE),
      date_trunc('day', end_date::DATE),
      '1 day'::INTERVAL
    )::DATE as period_date
  ),
  enrollment_data AS (
    SELECT 
      to_char(e.enrolled_at, date_format) as period,
      COUNT(*) as enrollments,
      AVG(c.current_enrollment::NUMERIC / NULLIF(c.capacity, 0) * 100) as avg_utilization
    FROM enrollments e
    JOIN classes c ON e.class_id = c.id
    WHERE c.institution_id = get_enrollment_trends.institution_id
      AND e.enrolled_at >= start_date
      AND e.enrolled_at <= end_date
    GROUP BY to_char(e.enrolled_at, date_format)
  ),
  request_data AS (
    SELECT 
      to_char(er.requested_at, date_format) as period,
      COUNT(*) as requests,
      COUNT(*) FILTER (WHERE er.status = 'approved')::NUMERIC / COUNT(*) * 100 as approval_rate
    FROM enrollment_requests er
    JOIN classes c ON er.class_id = c.id
    WHERE c.institution_id = get_enrollment_trends.institution_id
      AND er.requested_at >= start_date
      AND er.requested_at <= end_date
    GROUP BY to_char(er.requested_at, date_format)
  ),
  waitlist_data AS (
    SELECT 
      to_char(we.added_at, date_format) as period,
      COUNT(*) as waitlist_entries
    FROM waitlist_entries we
    JOIN classes c ON we.class_id = c.id
    WHERE c.institution_id = get_enrollment_trends.institution_id
      AND we.added_at >= start_date
      AND we.added_at <= end_date
    GROUP BY to_char(we.added_at, date_format)
  )
  SELECT 
    COALESCE(ed.period, rd.period, wd.period) as period,
    COALESCE(ed.enrollments, 0) as total_enrollments,
    COALESCE(rd.requests, 0) as total_requests,
    COALESCE(rd.approval_rate, 0) as approval_rate,
    COALESCE(ed.avg_utilization, 0) as capacity_utilization,
    COALESCE(wd.waitlist_entries, 0) as waitlist_size
  FROM enrollment_data ed
  FULL OUTER JOIN request_data rd ON ed.period = rd.period
  FULL OUTER JOIN waitlist_data wd ON COALESCE(ed.period, rd.period) = wd.period
  ORDER BY period;
END;
$$ LANGUAGE plpgsql;

-- Function to get waitlist statistics
CREATE OR REPLACE FUNCTION get_waitlist_statistics(institution_id UUID)
RETURNS TABLE (
  class_id UUID,
  class_name TEXT,
  department_name TEXT,
  total_waitlisted BIGINT,
  average_wait_time NUMERIC,
  promotion_rate NUMERIC,
  current_position INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH waitlist_stats AS (
    SELECT 
      c.id as class_id,
      c.name as class_name,
      d.name as department_name,
      COUNT(we.id) as total_waitlisted,
      AVG(EXTRACT(EPOCH FROM (COALESCE(we.notified_at, NOW()) - we.added_at)) / 86400) as avg_wait_days,
      COUNT(we.id) FILTER (WHERE we.notified_at IS NOT NULL)::NUMERIC / NULLIF(COUNT(we.id), 0) * 100 as promotion_rate,
      MIN(we.position) as min_position
    FROM classes c
    JOIN departments d ON c.department_id = d.id
    LEFT JOIN waitlist_entries we ON c.id = we.class_id
    WHERE c.institution_id = get_waitlist_statistics.institution_id
    GROUP BY c.id, c.name, d.name
  )
  SELECT 
    ws.class_id,
    ws.class_name,
    ws.department_name,
    ws.total_waitlisted,
    COALESCE(ws.avg_wait_days, 0) as average_wait_time,
    COALESCE(ws.promotion_rate, 0) as promotion_rate,
    COALESCE(ws.min_position, 0) as current_position
  FROM waitlist_stats ws
  WHERE ws.total_waitlisted > 0
  ORDER BY ws.total_waitlisted DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get institution enrollment statistics
CREATE OR REPLACE FUNCTION get_institution_enrollment_stats(institution_id UUID)
RETURNS TABLE (
  total_students BIGINT,
  total_classes BIGINT,
  total_enrollments BIGINT,
  total_waitlisted BIGINT,
  average_class_size NUMERIC,
  over_capacity_classes BIGINT,
  under_enrolled_classes BIGINT,
  pending_requests BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(DISTINCT e.student_id) 
     FROM enrollments e 
     JOIN classes c ON e.class_id = c.id 
     WHERE c.institution_id = get_institution_enrollment_stats.institution_id) as total_students,
    
    (SELECT COUNT(*) 
     FROM classes c 
     WHERE c.institution_id = get_institution_enrollment_stats.institution_id 
       AND c.status = 'active') as total_classes,
    
    (SELECT COUNT(*) 
     FROM enrollments e 
     JOIN classes c ON e.class_id = c.id 
     WHERE c.institution_id = get_institution_enrollment_stats.institution_id 
       AND e.status = 'enrolled') as total_enrollments,
    
    (SELECT COUNT(*) 
     FROM waitlist_entries we 
     JOIN classes c ON we.class_id = c.id 
     WHERE c.institution_id = get_institution_enrollment_stats.institution_id) as total_waitlisted,
    
    (SELECT AVG(c.current_enrollment) 
     FROM classes c 
     WHERE c.institution_id = get_institution_enrollment_stats.institution_id 
       AND c.status = 'active') as average_class_size,
    
    (SELECT COUNT(*) 
     FROM classes c 
     WHERE c.institution_id = get_institution_enrollment_stats.institution_id 
       AND c.current_enrollment > c.capacity) as over_capacity_classes,
    
    (SELECT COUNT(*) 
     FROM classes c 
     WHERE c.institution_id = get_institution_enrollment_stats.institution_id 
       AND c.current_enrollment < (c.capacity * 0.5)) as under_enrolled_classes,
    
    (SELECT COUNT(*) 
     FROM enrollment_requests er 
     JOIN classes c ON er.class_id = c.id 
     WHERE c.institution_id = get_institution_enrollment_stats.institution_id 
       AND er.status = 'pending') as pending_requests;
END;
$$ LANGUAGE plpgsql;

-- Function to detect suspicious enrollment activity
CREATE OR REPLACE FUNCTION detect_suspicious_enrollment_activity(institution_id UUID)
RETURNS TABLE (
  activity_type TEXT,
  description TEXT,
  student_id UUID,
  student_name TEXT,
  class_id UUID,
  class_name TEXT,
  severity TEXT,
  detected_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  -- Multiple enrollment attempts in short time
  SELECT 
    'rapid_enrollment_attempts' as activity_type,
    'Multiple enrollment requests within 5 minutes' as description,
    er.student_id,
    u.full_name as student_name,
    er.class_id,
    c.name as class_name,
    'medium' as severity,
    MAX(er.requested_at) as detected_at
  FROM enrollment_requests er
  JOIN users u ON er.student_id = u.id
  JOIN classes c ON er.class_id = c.id
  WHERE c.institution_id = detect_suspicious_enrollment_activity.institution_id
    AND er.requested_at >= NOW() - INTERVAL '1 hour'
  GROUP BY er.student_id, u.full_name, er.class_id, c.name
  HAVING COUNT(*) >= 3 
    AND MAX(er.requested_at) - MIN(er.requested_at) <= INTERVAL '5 minutes'
  
  UNION ALL
  
  -- Enrollment in conflicting time slots
  SELECT 
    'schedule_conflict' as activity_type,
    'Student enrolled in classes with overlapping schedules' as description,
    e1.student_id,
    u.full_name as student_name,
    e1.class_id,
    c1.name as class_name,
    'high' as severity,
    e1.enrolled_at as detected_at
  FROM enrollments e1
  JOIN enrollments e2 ON e1.student_id = e2.student_id AND e1.id != e2.id
  JOIN classes c1 ON e1.class_id = c1.id
  JOIN classes c2 ON e2.class_id = c2.id
  JOIN users u ON e1.student_id = u.id
  WHERE c1.institution_id = detect_suspicious_enrollment_activity.institution_id
    AND c1.schedule_json IS NOT NULL 
    AND c2.schedule_json IS NOT NULL
    AND e1.status = 'enrolled' 
    AND e2.status = 'enrolled'
    -- This would need more complex JSON schedule overlap logic
  
  ORDER BY detected_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to override enrollment with proper logging
CREATE OR REPLACE FUNCTION override_enrollment(
  student_id UUID,
  class_id UUID,
  override_type TEXT,
  reason TEXT,
  performed_by UUID
)
RETURNS VOID AS $$
BEGIN
  -- Log the override
  INSERT INTO enrollment_overrides (student_id, class_id, override_type, reason, performed_by)
  VALUES (student_id, class_id, override_type, reason, performed_by);
  
  -- Perform the actual enrollment based on override type
  IF override_type = 'capacity' THEN
    -- Allow enrollment even if over capacity
    INSERT INTO enrollments (student_id, class_id, enrolled_by, metadata)
    VALUES (student_id, class_id, performed_by, jsonb_build_object('override', 'capacity'))
    ON CONFLICT (student_id, class_id) DO NOTHING;
    
    -- Update class enrollment count
    UPDATE classes 
    SET current_enrollment = current_enrollment + 1
    WHERE id = class_id;
    
  ELSIF override_type = 'prerequisite' THEN
    -- Allow enrollment without prerequisite check
    INSERT INTO enrollments (student_id, class_id, enrolled_by, metadata)
    VALUES (student_id, class_id, performed_by, jsonb_build_object('override', 'prerequisite'))
    ON CONFLICT (student_id, class_id) DO NOTHING;
    
  ELSIF override_type = 'restriction' THEN
    -- Allow enrollment despite restrictions
    INSERT INTO enrollments (student_id, class_id, enrolled_by, metadata)
    VALUES (student_id, class_id, performed_by, jsonb_build_object('override', 'restriction'))
    ON CONFLICT (student_id, class_id) DO NOTHING;
  END IF;
  
  -- Log in audit trail
  INSERT INTO enrollment_audit_log (student_id, class_id, action, performed_by, reason, metadata)
  VALUES (student_id, class_id, 'override_enrollment', performed_by, reason, 
          jsonb_build_object('override_type', override_type));
END;
$$ LANGUAGE plpgsql;

-- Function to generate enrollment reports
CREATE OR REPLACE FUNCTION generate_enrollment_report(
  institution_id UUID,
  report_type TEXT,
  filters JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  CASE report_type
    WHEN 'summary' THEN
      SELECT jsonb_build_object(
        'total_students', COUNT(DISTINCT e.student_id),
        'total_classes', COUNT(DISTINCT c.id),
        'total_enrollments', COUNT(e.id),
        'average_class_size', AVG(c.current_enrollment),
        'capacity_utilization', AVG(c.current_enrollment::NUMERIC / NULLIF(c.capacity, 0) * 100)
      ) INTO result
      FROM classes c
      LEFT JOIN enrollments e ON c.id = e.class_id AND e.status = 'enrolled'
      WHERE c.institution_id = generate_enrollment_report.institution_id;
      
    WHEN 'detailed' THEN
      SELECT jsonb_agg(
        jsonb_build_object(
          'class_name', c.name,
          'department', d.name,
          'instructor', i.full_name,
          'capacity', c.capacity,
          'enrolled', c.current_enrollment,
          'waitlisted', COALESCE(w.waitlist_count, 0),
          'utilization_rate', (c.current_enrollment::NUMERIC / NULLIF(c.capacity, 0) * 100)
        )
      ) INTO result
      FROM classes c
      JOIN departments d ON c.department_id = d.id
      LEFT JOIN users i ON c.instructor_id = i.id
      LEFT JOIN (
        SELECT class_id, COUNT(*) as waitlist_count
        FROM waitlist_entries
        GROUP BY class_id
      ) w ON c.id = w.class_id
      WHERE c.institution_id = generate_enrollment_report.institution_id;
      
    ELSE
      result := '{"error": "Invalid report type"}'::JSONB;
  END CASE;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;