-- Real-time enrollment database functions and triggers
-- This migration adds functions for handling concurrent enrollment with proper locking

-- Function to begin a transaction (for use with Supabase RPC)
CREATE OR REPLACE FUNCTION begin_transaction()
RETURNS TEXT AS $$
BEGIN
  -- This is a placeholder function since Supabase handles transactions differently
  -- In practice, we'll use Supabase's built-in transaction handling
  RETURN 'transaction_started';
END;
$$ LANGUAGE plpgsql;

-- Function to commit a transaction
CREATE OR REPLACE FUNCTION commit_transaction()
RETURNS TEXT AS $$
BEGIN
  -- Placeholder for transaction commit
  RETURN 'transaction_committed';
END;
$$ LANGUAGE plpgsql;

-- Function to rollback a transaction
CREATE OR REPLACE FUNCTION rollback_transaction()
RETURNS TEXT AS $$
BEGIN
  -- Placeholder for transaction rollback
  RETURN 'transaction_rolled_back';
END;
$$ LANGUAGE plpgsql;

-- Function to lock a class for enrollment (prevents race conditions)
CREATE OR REPLACE FUNCTION lock_class_for_enrollment(class_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Use advisory lock to prevent concurrent enrollment modifications
  PERFORM pg_advisory_xact_lock(hashtext(class_id::text));
  
  -- Also lock the class row for update
  PERFORM id FROM classes WHERE id = class_id FOR UPDATE;
END;
$$ LANGUAGE plpgsql;

-- Function to safely increment enrollment count
CREATE OR REPLACE FUNCTION increment_enrollment_count(class_id UUID)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE classes 
  SET current_enrollment = current_enrollment + 1,
      updated_at = NOW()
  WHERE id = class_id
  RETURNING current_enrollment INTO new_count;
  
  RETURN new_count;
END;
$$ LANGUAGE plpgsql;

-- Function to safely decrement enrollment count
CREATE OR REPLACE FUNCTION decrement_enrollment_count(class_id UUID)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE classes 
  SET current_enrollment = GREATEST(0, current_enrollment - 1),
      updated_at = NOW()
  WHERE id = class_id
  RETURNING current_enrollment INTO new_count;
  
  RETURN new_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get next waitlist position with proper locking
CREATE OR REPLACE FUNCTION get_next_waitlist_position(class_id UUID, priority_level INTEGER DEFAULT 0)
RETURNS INTEGER AS $$
DECLARE
  next_position INTEGER;
BEGIN
  -- Lock waitlist entries for this class
  PERFORM pg_advisory_xact_lock(hashtext('waitlist_' || class_id::text));
  
  -- Get the next position based on priority
  SELECT COALESCE(MAX(position), 0) + 1
  INTO next_position
  FROM waitlist_entries
  WHERE class_id = get_next_waitlist_position.class_id;
  
  RETURN next_position;
END;
$$ LANGUAGE plpgsql;

-- Function to reorder waitlist positions after changes
CREATE OR REPLACE FUNCTION reorder_waitlist_positions(class_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Update positions based on priority and added_at timestamp
  WITH ordered_entries AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        ORDER BY priority DESC, added_at ASC
      ) as new_position
    FROM waitlist_entries
    WHERE class_id = reorder_waitlist_positions.class_id
  )
  UPDATE waitlist_entries
  SET position = ordered_entries.new_position,
      updated_at = NOW()
  FROM ordered_entries
  WHERE waitlist_entries.id = ordered_entries.id;
END;
$$ LANGUAGE plpgsql;

-- Function to process waitlist automatically when spots become available
CREATE OR REPLACE FUNCTION process_waitlist_automatically(class_id UUID)
RETURNS TABLE(student_id UUID, position INTEGER) AS $$
DECLARE
  available_spots INTEGER;
  class_capacity INTEGER;
  current_enrollment INTEGER;
BEGIN
  -- Get class capacity and current enrollment
  SELECT capacity, current_enrollment
  INTO class_capacity, current_enrollment
  FROM classes
  WHERE id = class_id;
  
  available_spots := class_capacity - current_enrollment;
  
  -- Return students who should be notified (up to available spots)
  RETURN QUERY
  SELECT we.student_id, we.position
  FROM waitlist_entries we
  WHERE we.class_id = process_waitlist_automatically.class_id
    AND we.notified_at IS NULL
  ORDER BY we.priority DESC, we.added_at ASC
  LIMIT available_spots;
END;
$$ LANGUAGE plpgsql;

-- Function to update enrollment statistics in real-time
CREATE OR REPLACE FUNCTION update_enrollment_statistics(class_id UUID)
RETURNS VOID AS $$
DECLARE
  enrolled_count INTEGER;
  waitlisted_count INTEGER;
  pending_count INTEGER;
  class_capacity INTEGER;
  utilization_rate NUMERIC;
BEGIN
  -- Get current counts
  SELECT COUNT(*) INTO enrolled_count
  FROM enrollments
  WHERE class_id = update_enrollment_statistics.class_id
    AND status = 'enrolled';
  
  SELECT COUNT(*) INTO waitlisted_count
  FROM waitlist_entries
  WHERE class_id = update_enrollment_statistics.class_id;
  
  SELECT COUNT(*) INTO pending_count
  FROM enrollment_requests
  WHERE class_id = update_enrollment_statistics.class_id
    AND status = 'pending';
  
  SELECT capacity INTO class_capacity
  FROM classes
  WHERE id = update_enrollment_statistics.class_id;
  
  -- Calculate utilization rate
  utilization_rate := CASE 
    WHEN class_capacity > 0 THEN (enrolled_count::NUMERIC / class_capacity::NUMERIC) * 100
    ELSE 0
  END;
  
  -- Update or insert statistics
  INSERT INTO enrollment_statistics (
    class_id,
    total_enrolled,
    total_waitlisted,
    total_pending,
    capacity_utilization,
    last_updated
  )
  VALUES (
    update_enrollment_statistics.class_id,
    enrolled_count,
    waitlisted_count,
    pending_count,
    utilization_rate,
    NOW()
  )
  ON CONFLICT (class_id)
  DO UPDATE SET
    total_enrolled = EXCLUDED.total_enrolled,
    total_waitlisted = EXCLUDED.total_waitlisted,
    total_pending = EXCLUDED.total_pending,
    capacity_utilization = EXCLUDED.capacity_utilization,
    last_updated = EXCLUDED.last_updated;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to update statistics when enrollments change
CREATE OR REPLACE FUNCTION trigger_update_enrollment_statistics()
RETURNS TRIGGER AS $$
BEGIN
  -- Update statistics for the affected class
  IF TG_OP = 'DELETE' THEN
    PERFORM update_enrollment_statistics(OLD.class_id);
    RETURN OLD;
  ELSE
    PERFORM update_enrollment_statistics(NEW.class_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to update statistics when waitlist changes
CREATE OR REPLACE FUNCTION trigger_update_waitlist_statistics()
RETURNS TRIGGER AS $$
BEGIN
  -- Update statistics for the affected class
  IF TG_OP = 'DELETE' THEN
    PERFORM update_enrollment_statistics(OLD.class_id);
    RETURN OLD;
  ELSE
    PERFORM update_enrollment_statistics(NEW.class_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic statistics updates
DROP TRIGGER IF EXISTS enrollment_statistics_trigger ON enrollments;
CREATE TRIGGER enrollment_statistics_trigger
  AFTER INSERT OR UPDATE OR DELETE ON enrollments
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_enrollment_statistics();

DROP TRIGGER IF EXISTS waitlist_statistics_trigger ON waitlist_entries;
CREATE TRIGGER waitlist_statistics_trigger
  AFTER INSERT OR UPDATE OR DELETE ON waitlist_entries
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_waitlist_statistics();

-- Function to handle concurrent enrollment with race condition prevention
CREATE OR REPLACE FUNCTION enroll_student_safely(
  p_student_id UUID,
  p_class_id UUID,
  p_enrolled_by UUID DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  enrollment_id UUID,
  status TEXT,
  message TEXT,
  waitlist_position INTEGER
) AS $$
DECLARE
  class_capacity INTEGER;
  current_count INTEGER;
  new_enrollment_id UUID;
  waitlist_pos INTEGER;
BEGIN
  -- Lock the class to prevent race conditions
  PERFORM lock_class_for_enrollment(p_class_id);
  
  -- Get class capacity and current enrollment
  SELECT capacity, current_enrollment
  INTO class_capacity, current_count
  FROM classes
  WHERE id = p_class_id;
  
  -- Check if class exists
  IF class_capacity IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'error', 'Class not found', NULL::INTEGER;
    RETURN;
  END IF;
  
  -- Check if student is already enrolled
  IF EXISTS (
    SELECT 1 FROM enrollments
    WHERE student_id = p_student_id AND class_id = p_class_id
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'error', 'Student already enrolled', NULL::INTEGER;
    RETURN;
  END IF;
  
  -- Check if there's space in the class
  IF current_count < class_capacity THEN
    -- Enroll the student
    INSERT INTO enrollments (student_id, class_id, status, enrolled_by, enrolled_at)
    VALUES (p_student_id, p_class_id, 'enrolled', p_enrolled_by, NOW())
    RETURNING id INTO new_enrollment_id;
    
    -- Update enrollment count
    PERFORM increment_enrollment_count(p_class_id);
    
    RETURN QUERY SELECT TRUE, new_enrollment_id, 'enrolled', 'Successfully enrolled', NULL::INTEGER;
  ELSE
    -- Add to waitlist
    SELECT get_next_waitlist_position(p_class_id) INTO waitlist_pos;
    
    INSERT INTO waitlist_entries (student_id, class_id, position, added_at)
    VALUES (p_student_id, p_class_id, waitlist_pos, NOW());
    
    RETURN QUERY SELECT TRUE, NULL::UUID, 'waitlisted', 'Added to waitlist', waitlist_pos;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to drop student and process waitlist
CREATE OR REPLACE FUNCTION drop_student_and_process_waitlist(
  p_student_id UUID,
  p_class_id UUID,
  p_performed_by UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  next_student_id UUID,
  next_student_position INTEGER
) AS $$
DECLARE
  enrollment_exists BOOLEAN;
  next_waitlist_student UUID;
  next_position INTEGER;
BEGIN
  -- Lock the class
  PERFORM lock_class_for_enrollment(p_class_id);
  
  -- Check if enrollment exists
  SELECT EXISTS (
    SELECT 1 FROM enrollments
    WHERE student_id = p_student_id AND class_id = p_class_id AND status = 'enrolled'
  ) INTO enrollment_exists;
  
  IF NOT enrollment_exists THEN
    RETURN QUERY SELECT FALSE, 'Student is not enrolled in this class', NULL::UUID, NULL::INTEGER;
    RETURN;
  END IF;
  
  -- Update enrollment status to dropped
  UPDATE enrollments
  SET status = 'dropped', updated_at = NOW()
  WHERE student_id = p_student_id AND class_id = p_class_id;
  
  -- Decrement enrollment count
  PERFORM decrement_enrollment_count(p_class_id);
  
  -- Log the action
  INSERT INTO enrollment_audit_log (student_id, class_id, action, performed_by, reason, timestamp)
  VALUES (p_student_id, p_class_id, 'dropped', p_performed_by, p_reason, NOW());
  
  -- Get next student from waitlist
  SELECT we.student_id, we.position
  INTO next_waitlist_student, next_position
  FROM waitlist_entries we
  WHERE we.class_id = p_class_id
    AND we.notified_at IS NULL
  ORDER BY we.priority DESC, we.added_at ASC
  LIMIT 1;
  
  -- Mark the next student as notified
  IF next_waitlist_student IS NOT NULL THEN
    UPDATE waitlist_entries
    SET notified_at = NOW(),
        notification_expires_at = NOW() + INTERVAL '24 hours'
    WHERE student_id = next_waitlist_student AND class_id = p_class_id;
  END IF;
  
  RETURN QUERY SELECT TRUE, 'Student dropped successfully', next_waitlist_student, next_position;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired waitlist notifications
CREATE OR REPLACE FUNCTION cleanup_expired_waitlist_notifications()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  -- Remove expired waitlist entries
  WITH expired_entries AS (
    DELETE FROM waitlist_entries
    WHERE notification_expires_at < NOW()
      AND notified_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM waitlist_notifications wn
        WHERE wn.waitlist_entry_id = waitlist_entries.id
          AND wn.responded = TRUE
      )
    RETURNING class_id
  )
  SELECT COUNT(*) INTO expired_count FROM expired_entries;
  
  -- Reorder waitlists for affected classes
  FOR class_record IN (
    SELECT DISTINCT class_id
    FROM waitlist_entries
    WHERE notification_expires_at < NOW()
      AND notified_at IS NOT NULL
  ) LOOP
    PERFORM reorder_waitlist_positions(class_record.class_id);
  END LOOP;
  
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_enrollments_realtime ON enrollments(class_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_realtime ON waitlist_entries(class_id, position, priority, added_at);
CREATE INDEX IF NOT EXISTS idx_enrollment_audit_realtime ON enrollment_audit_log(class_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_enrollment_stats_class ON enrollment_statistics(class_id);

-- Create a scheduled job to clean up expired notifications (if using pg_cron)
-- This would need to be set up separately in the database
-- SELECT cron.schedule('cleanup-expired-waitlist', '*/5 * * * *', 'SELECT cleanup_expired_waitlist_notifications();');

COMMENT ON FUNCTION lock_class_for_enrollment(UUID) IS 'Locks a class to prevent race conditions during enrollment operations';
COMMENT ON FUNCTION enroll_student_safely(UUID, UUID, UUID) IS 'Safely enrolls a student with race condition prevention';
COMMENT ON FUNCTION drop_student_and_process_waitlist(UUID, UUID, UUID, TEXT) IS 'Drops a student and automatically processes the waitlist';
COMMENT ON FUNCTION cleanup_expired_waitlist_notifications() IS 'Cleans up expired waitlist notifications and reorders waitlists';