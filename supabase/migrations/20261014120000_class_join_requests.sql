-- =============================================================================
-- Joining a class needs the teacher's approval
-- =============================================================================
-- Before: a valid class code enrolled the student at once.
-- Now:
--   * join_class_by_code() creates (or renews) a 'pending' enrollment and
--     notifies the teacher. Pending gives no access: every policy and helper
--     only counts 'enrolled'/'active'.
--   * review_join_request() lets the class's teacher accept (-> 'enrolled',
--     student joins the teacher's institution if they have none) or decline
--     (-> 'declined'). The student is notified either way. Class size is
--     checked on acceptance.
--   * my_join_requests() lists the caller's pending requests with the class
--     and teacher names (they can't read the class itself yet).
--   * leave_class() also withdraws a pending request.
-- Existing enrollments are unchanged.
-- =============================================================================

BEGIN;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'assignment_created',
    'assignment_graded',
    'assignment_due_soon',
    'assignment_submitted',
    'class_announcement',
    'class_created',
    'enrollment_approved',
    'enrollment_declined',
    'enrollment_requested',
    'role_changed',
    'system_message'
  )
);

CREATE INDEX IF NOT EXISTS enrollments_class_pending_idx
  ON public.enrollments (class_id) WHERE status = 'pending';

-- -----------------------------------------------------------------------------
-- Request to join
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_class_by_code(p_code text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_class public.classes%ROWTYPE;
  v_enrollment public.enrollments%ROWTYPE;
  v_has_enrollment boolean;
  v_teacher_name text;
  v_student_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join a class' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_class
  FROM public.classes
  WHERE code = upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'))
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active class found with that code' USING ERRCODE = 'P0002';
  END IF;

  IF v_class.teacher_id = v_uid THEN
    RAISE EXCEPTION 'You teach this class' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_enrollment
  FROM public.enrollments
  WHERE class_id = v_class.id AND student_id = v_uid;
  v_has_enrollment := FOUND;

  IF v_has_enrollment AND v_enrollment.status IN ('enrolled', 'active') THEN
    RAISE EXCEPTION 'You are already enrolled in this class' USING ERRCODE = '23505';
  END IF;
  IF v_has_enrollment AND v_enrollment.status = 'pending' THEN
    RAISE EXCEPTION 'You have already asked to join this class. Your teacher hasn''t answered yet.'
      USING ERRCODE = '23505';
  END IF;

  IF v_has_enrollment THEN
    -- Asking again after leaving, being removed or being declined.
    UPDATE public.enrollments
    SET status = 'pending', enrolled_at = now(), updated_at = now()
    WHERE id = v_enrollment.id
    RETURNING * INTO v_enrollment;
  ELSE
    INSERT INTO public.enrollments (class_id, student_id, status, enrolled_at)
    VALUES (v_class.id, v_uid, 'pending', now())
    RETURNING * INTO v_enrollment;
  END IF;

  SELECT nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
  INTO v_teacher_name
  FROM public.users WHERE id = v_class.teacher_id;

  SELECT coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), email)
  INTO v_student_name
  FROM public.users WHERE id = v_uid;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, action_url, action_label, metadata)
  VALUES (
    v_class.teacher_id,
    'enrollment_requested',
    left(v_student_name || ' asked to join ' || v_class.name, 255),
    'Accept or decline the request on the class''s Students tab.',
    'high',
    '/dashboard/teacher/classes/' || v_class.id || '/manage?tab=students',
    'Review request',
    jsonb_build_object('class_id', v_class.id, 'student_id', v_uid)
  );

  RETURN json_build_object(
    'enrollment_id', v_enrollment.id,
    'class_id', v_class.id,
    'class_name', v_class.name,
    'class_description', v_class.description,
    'teacher_name', v_teacher_name,
    'enrolled_at', v_enrollment.enrolled_at,
    'status', 'pending'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.join_class_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_class_by_code(text) TO authenticated;

-- -----------------------------------------------------------------------------
-- Teacher accepts or declines
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_join_request(
  p_class uuid, p_student uuid, p_accept boolean)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_class public.classes%ROWTYPE;
  v_teacher_inst uuid;
  v_active integer;
BEGIN
  SELECT * INTO v_class FROM public.classes WHERE id = p_class FOR UPDATE;
  IF NOT FOUND OR v_class.teacher_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the class''s teacher can answer join requests'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.enrollments
  WHERE class_id = p_class AND student_id = p_student AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'There is no pending request from this student'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_accept THEN
    IF v_class.max_enrollment IS NOT NULL THEN
      SELECT count(*) INTO v_active FROM public.enrollments
      WHERE class_id = p_class AND status IN ('enrolled', 'active');
      IF v_active >= v_class.max_enrollment THEN
        RAISE EXCEPTION 'This class has reached its maximum enrollment'
          USING ERRCODE = '53400';
      END IF;
    END IF;

    UPDATE public.enrollments
    SET status = 'enrolled', enrolled_at = now(), updated_at = now()
    WHERE class_id = p_class AND student_id = p_student;

    -- A student without an institution joins the teacher's.
    SELECT institution_id INTO v_teacher_inst FROM public.users WHERE id = v_class.teacher_id;
    IF v_teacher_inst IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.users
         WHERE id = p_student AND role = 'student' AND institution_id IS NULL) THEN
      PERFORM app_private.link_users_to_institution(ARRAY[p_student], v_teacher_inst);
    END IF;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, action_url, action_label, metadata)
    VALUES (
      p_student, 'enrollment_approved',
      left('You joined ' || v_class.name, 255),
      'Your teacher accepted your request. The class''s materials and assignments are now open to you.',
      'medium',
      '/dashboard/student/classes/' || p_class,
      'Open class',
      jsonb_build_object('class_id', p_class)
    );
    RETURN 'enrolled';
  END IF;

  UPDATE public.enrollments
  SET status = 'declined', updated_at = now()
  WHERE class_id = p_class AND student_id = p_student;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, action_url, metadata)
  VALUES (
    p_student, 'enrollment_declined',
    left('Your request to join ' || v_class.name || ' was declined', 255),
    'If you think this is a mistake, speak to your teacher. You can ask again with the class code.',
    'medium',
    '/dashboard/student/classes',
    jsonb_build_object('class_id', p_class)
  );
  RETURN 'declined';
END;
$$;
REVOKE ALL ON FUNCTION public.review_join_request(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_join_request(uuid, uuid, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- The student's own pending requests
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_join_requests()
RETURNS TABLE (class_id uuid, class_name text, teacher_name text, requested_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.id,
         c.name::text,
         nullif(trim(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '')), ''),
         e.enrolled_at
  FROM public.enrollments e
  JOIN public.classes c ON c.id = e.class_id
  LEFT JOIN public.users t ON t.id = c.teacher_id
  WHERE e.student_id = auth.uid() AND e.status = 'pending'
  ORDER BY e.enrolled_at DESC
$$;
REVOKE ALL ON FUNCTION public.my_join_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_join_requests() TO authenticated;

-- -----------------------------------------------------------------------------
-- Leaving also withdraws a pending request
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_class(p_class uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '42501';
  END IF;
  UPDATE public.enrollments
  SET status = CASE WHEN status = 'pending' THEN 'cancelled' ELSE 'dropped' END,
      updated_at = now()
  WHERE class_id = p_class AND student_id = auth.uid()
    AND status IN ('enrolled', 'active', 'pending');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not enrolled in this class' USING ERRCODE = 'P0002';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.leave_class(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_class(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
