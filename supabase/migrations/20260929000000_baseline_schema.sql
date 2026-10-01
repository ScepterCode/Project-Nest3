-- =============================================================================
-- Baseline schema (generated 2026-09-30 from the live database)
-- =============================================================================
-- Until now the database was built by hand-run SQL that isn't in the repo.
-- This migration recreates the public and app_private schemas exactly as they
-- were in production on this date: tables, constraints, indexes, functions,
-- triggers, RLS policies and grants. It already includes the effect of the
-- 2026-09-30 migrations that follow it; those are kept (and are safe to re-run)
-- because they were applied to production individually.
--
-- Regenerate with scripts/db/build-baseline.js (see docs/database.md).
-- Do not edit by hand: add a new migration instead.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.4
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app_private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS app_private;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: administers_class(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.administers_class(p_class uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = p_class AND app_private.is_institution_admin_of(c.institution_id)
  )
$$;


--
-- Name: administers_user(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.administers_user(p_user uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user AND app_private.is_institution_admin_of(u.institution_id)
  )
$$;


--
-- Name: can_view_criterion(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.can_view_criterion(p_criterion uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rubric_criteria rc
    WHERE rc.id = p_criterion AND app_private.can_view_rubric(rc.rubric_id)
  )
$$;


--
-- Name: can_view_rubric(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.can_view_rubric(p_rubric uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT app_private.owns_rubric(p_rubric) OR EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.rubric_id = p_rubric
      AND (app_private.teaches_class(a.class_id) OR app_private.is_enrolled_in(a.class_id))
  )
$$;


--
-- Name: created_institution(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.created_institution(p_institution uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.institutions WHERE id = p_institution AND created_by = auth.uid()
  )
$$;


--
-- Name: guard_submission_grading(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.guard_submission_grading() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF app_private.is_trusted_caller() OR app_private.teaches_assignment(NEW.assignment_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.grade IS NOT NULL OR NEW.feedback IS NOT NULL OR NEW.graded_at IS NOT NULL
       OR NEW.graded_by IS NOT NULL OR NEW.rubric_scores IS NOT NULL
       OR NEW.status = 'graded' THEN
      RAISE EXCEPTION 'Only the teacher can grade a submission' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id THEN
    RAISE EXCEPTION 'Cannot move a submission to another student or assignment'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.grade IS DISTINCT FROM OLD.grade
     OR NEW.feedback IS DISTINCT FROM OLD.feedback
     OR NEW.graded_at IS DISTINCT FROM OLD.graded_at
     OR NEW.graded_by IS DISTINCT FROM OLD.graded_by
     OR NEW.rubric_scores IS DISTINCT FROM OLD.rubric_scores
     OR (NEW.status = 'graded' AND OLD.status IS DISTINCT FROM 'graded') THEN
    RAISE EXCEPTION 'Only the teacher can grade a submission' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_users_privileged_columns(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.guard_users_privileged_columns() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_my_role text;
  v_my_inst uuid;
BEGIN
  IF app_private.is_trusted_caller() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- An upsert on an existing row is checked by the UPDATE branch instead.
    IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
      RETURN NEW;
    END IF;
    IF NEW.role NOT IN ('student', 'teacher', 'institution_admin') THEN
      RAISE EXCEPTION 'Cannot self-register with role %', NEW.role USING ERRCODE = '42501';
    END IF;
    IF NEW.institution_id IS NOT NULL OR NEW.department_id IS NOT NULL THEN
      RAISE EXCEPTION 'Institution and department are assigned by an administrator'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'id and email cannot be changed here' USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.institution_id IS NOT DISTINCT FROM OLD.institution_id
     AND NEW.department_id IS NOT DISTINCT FROM OLD.department_id THEN
    RETURN NEW;
  END IF;

  SELECT role, institution_id INTO v_my_role, v_my_inst FROM public.users WHERE id = v_uid;

  -- Institution admins managing existing members of their own institution.
  -- They can never grant system_admin or department_admin, and can't pull in
  -- users from elsewhere.
  IF v_my_role = 'institution_admin' AND v_my_inst IS NOT NULL
     AND OLD.institution_id = v_my_inst
     AND (NEW.institution_id IS NULL OR NEW.institution_id = v_my_inst)
     AND NEW.role IN ('student', 'teacher', 'institution_admin')
     AND (NEW.department_id IS NULL OR EXISTS (
           SELECT 1 FROM public.departments d
           WHERE d.id = NEW.department_id AND d.institution_id = v_my_inst)) THEN
    RETURN NEW;
  END IF;

  -- Institution setup: an institution_admin with no institution claims the one
  -- they just created (see /api/institutions/create).
  IF NEW.id = v_uid AND OLD.role = 'institution_admin' AND NEW.role = OLD.role
     AND OLD.institution_id IS NULL AND NEW.institution_id IS NOT NULL
     AND NEW.department_id IS NOT DISTINCT FROM OLD.department_id
     AND EXISTS (SELECT 1 FROM public.institutions i
                 WHERE i.id = NEW.institution_id AND i.created_by = v_uid) THEN
    RETURN NEW;
  END IF;

  -- Anyone picking a department inside the institution they already belong to.
  IF NEW.id = v_uid AND NEW.role = OLD.role
     AND NEW.institution_id IS NOT DISTINCT FROM OLD.institution_id
     AND NEW.department_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.departments d
                 WHERE d.id = NEW.department_id AND d.institution_id = OLD.institution_id) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not allowed to change role, institution or department'
    USING ERRCODE = '42501';
END;
$$;


--
-- Name: is_enrolled_for_assignment(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.is_enrolled_for_assignment(p_assignment uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assignments a
    JOIN public.enrollments e ON e.class_id = a.class_id
    WHERE a.id = p_assignment AND e.student_id = auth.uid() AND e.status IN ('enrolled', 'active')
  )
$$;


--
-- Name: is_enrolled_in(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.is_enrolled_in(p_class uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE class_id = p_class AND student_id = auth.uid() AND status IN ('enrolled', 'active')
  )
$$;


--
-- Name: is_institution_admin_of(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.is_institution_admin_of(p_institution uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT p_institution IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'institution_admin' AND institution_id = p_institution
  )
$$;


--
-- Name: is_my_teacher(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.is_my_teacher(p_teacher uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.classes c ON c.id = e.class_id
    WHERE e.student_id = auth.uid() AND e.status IN ('enrolled', 'active')
      AND c.teacher_id = p_teacher
  )
$$;


--
-- Name: is_trusted_caller(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.is_trusted_caller() RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT auth.uid() IS NULL OR coalesce(auth.role(), '') = 'service_role'
$$;


--
-- Name: my_institution_id(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.my_institution_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT institution_id FROM public.users WHERE id = auth.uid()
$$;


--
-- Name: my_role(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.my_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;


--
-- Name: owns_criterion(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.owns_criterion(p_criterion uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rubric_criteria rc
    WHERE rc.id = p_criterion AND app_private.owns_rubric(rc.rubric_id)
  )
$$;


--
-- Name: owns_peer_review_assignment(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.owns_peer_review_assignment(p_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.peer_review_assignments
    WHERE id = p_id AND teacher_id = auth.uid()
  )
$$;


--
-- Name: owns_rubric(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.owns_rubric(p_rubric uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.rubrics WHERE id = p_rubric AND teacher_id = auth.uid())
$$;


--
-- Name: participates_in_peer_review(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.participates_in_peer_review(p_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.peer_reviews
    WHERE peer_review_assignment_id = p_id
      AND (reviewer_id = auth.uid() OR reviewee_id = auth.uid())
  )
$$;


--
-- Name: reviews_submission(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.reviews_submission(p_submission uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.peer_reviews WHERE submission_id = p_submission AND reviewer_id = auth.uid()
  )
$$;


--
-- Name: reviews_submission_path(text); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.reviews_submission_path(p_name text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.submissions s
    JOIN public.peer_reviews pr ON pr.submission_id = s.id
    WHERE pr.reviewer_id = auth.uid()
      AND (s.file_url = p_name OR s.file_url LIKE '%/submissions/' || p_name)
  )
$$;


--
-- Name: teaches_assignment(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.teaches_assignment(p_assignment uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assignments a
    JOIN public.classes c ON c.id = a.class_id
    WHERE a.id = p_assignment AND c.teacher_id = auth.uid()
  )
$$;


--
-- Name: teaches_class(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.teaches_class(p_class uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.classes WHERE id = p_class AND teacher_id = auth.uid())
$$;


--
-- Name: teaches_student(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.teaches_student(p_student uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.classes c ON c.id = e.class_id
    WHERE e.student_id = p_student AND c.teacher_id = auth.uid()
  )
$$;


--
-- Name: teaches_submission_path(text); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.teaches_submission_path(p_name text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_folder text := split_part(p_name, '/', 2);
BEGIN
  IF v_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  RETURN app_private.teaches_assignment(v_folder::uuid);
END;
$_$;


--
-- Name: cleanup_expired_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_notifications() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM notifications 
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


--
-- Name: cleanup_expired_role_requests(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_role_requests() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE role_requests 
  SET status = 'expired'
  WHERE expires_at <= NOW() 
    AND status = 'pending';
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;


--
-- Name: create_default_notification_preferences(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_default_notification_preferences() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: create_notification(uuid, character varying, character varying, text, character varying, text, character varying, jsonb, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_notification(p_user_id uuid, p_type character varying, p_title character varying, p_message text, p_priority character varying DEFAULT 'medium'::character varying, p_action_url text DEFAULT NULL::text, p_action_label character varying DEFAULT NULL::character varying, p_metadata jsonb DEFAULT '{}'::jsonb, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (
    user_id, type, title, message, priority, 
    action_url, action_label, metadata, expires_at
  )
  VALUES (
    p_user_id, p_type, p_title, p_message, p_priority,
    p_action_url, p_action_label, p_metadata, p_expires_at
  )
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$;


--
-- Name: create_savepoint(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_savepoint(savepoint_name text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  EXECUTE format('SAVEPOINT %I', savepoint_name);
END;
$$;


--
-- Name: expire_temporary_roles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_temporary_roles() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE user_role_assignments 
  SET status = 'expired', updated_at = NOW()
  WHERE expires_at <= NOW() 
    AND status = 'active' 
    AND is_temporary = TRUE;
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;


--
-- Name: get_bulk_assignment_stats(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_bulk_assignment_stats(p_assignment_id uuid) RETURNS TABLE(total_users integer, processed_users integer, successful_assignments integer, failed_assignments integer, pending_assignments integer, conflicts integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bra.total_users,
    bra.processed_users,
    bra.successful_assignments,
    bra.failed_assignments,
    COUNT(CASE WHEN brai.assignment_status = 'pending' THEN 1 END)::INTEGER as pending_assignments,
    COUNT(CASE WHEN brai.assignment_status = 'conflict' THEN 1 END)::INTEGER as conflicts
  FROM bulk_role_assignments bra
  LEFT JOIN bulk_role_assignment_items brai ON bra.id = brai.bulk_assignment_id
  WHERE bra.id = p_assignment_id
  GROUP BY bra.id, bra.total_users, bra.processed_users, bra.successful_assignments, bra.failed_assignments;
END;
$$;


--
-- Name: get_my_peer_review_tasks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_peer_review_tasks() RETURNS TABLE(id uuid, status text, time_spent integer, peer_review_assignment_id uuid, title text, end_date timestamp with time zone, author_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT pr.id, pr.status, coalesce(pr.time_spent, 0), a.id, a.title, a.end_date,
         CASE WHEN a.review_type = 'blind' THEN NULL
              ELSE nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '')
         END
  FROM public.peer_reviews pr
  JOIN public.peer_review_assignments a ON a.id = pr.peer_review_assignment_id
  LEFT JOIN public.users u ON u.id = pr.reviewee_id
  WHERE pr.reviewer_id = auth.uid()
    AND a.status IN ('active', 'completed')
  ORDER BY a.end_date NULLS LAST, pr.created_at
$$;


--
-- Name: get_my_received_peer_reviews(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_received_peer_reviews() RETURNS TABLE(id uuid, assignment_title text, reviewer_name text, submitted_at timestamp with time zone, overall_rating integer, rating_scale integer, feedback jsonb, helpfulness_rating integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT pr.id, a.title,
         CASE WHEN a.review_type = 'anonymous' THEN NULL
              ELSE nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '')
         END,
         pr.submitted_at, pr.overall_rating,
         coalesce((a.settings->>'rating_scale')::integer, 5),
         pr.feedback, pr.helpfulness_rating
  FROM public.peer_reviews pr
  JOIN public.peer_review_assignments a ON a.id = pr.peer_review_assignment_id
  LEFT JOIN public.users u ON u.id = pr.reviewer_id
  WHERE pr.reviewee_id = auth.uid()
    AND pr.status = 'completed'
  ORDER BY pr.submitted_at DESC
$$;


--
-- Name: get_notification_summary(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_notification_summary(p_user_id uuid) RETURNS TABLE(total_count bigint, unread_count bigint, high_priority_count bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE is_read = FALSE) as unread_count,
    COUNT(*) FILTER (WHERE is_read = FALSE AND priority IN ('high', 'urgent')) as high_priority_count
  FROM notifications 
  WHERE user_id = p_user_id 
  AND (expires_at IS NULL OR expires_at > NOW());
END;
$$;


--
-- Name: get_peer_review(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_peer_review(p_review_id uuid) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result json;
BEGIN
  SELECT json_build_object(
    'id', pr.id,
    'status', pr.status,
    'overall_rating', pr.overall_rating,
    'feedback', pr.feedback,
    'time_spent', coalesce(pr.time_spent, 0),
    'submitted_at', pr.submitted_at,
    'peer_review_assignment', json_build_object(
      'id', a.id,
      'title', a.title,
      'instructions', a.instructions,
      'review_type', a.review_type,
      'settings', a.settings,
      'end_date', a.end_date
    ),
    'submission', json_build_object(
      'id', s.id,
      'assignment_title', asg.title,
      'content', s.content,
      'file_url', s.file_url,
      'link_url', s.link_url
    ),
    'author_name', CASE WHEN a.review_type = 'blind' THEN NULL
                        ELSE nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '')
                   END
  ) INTO v_result
  FROM public.peer_reviews pr
  JOIN public.peer_review_assignments a ON a.id = pr.peer_review_assignment_id
  LEFT JOIN public.submissions s ON s.id = pr.submission_id
  LEFT JOIN public.assignments asg ON asg.id = a.assignment_id
  LEFT JOIN public.users u ON u.id = pr.reviewee_id
  WHERE pr.id = p_review_id
    AND pr.reviewer_id = auth.uid()
    AND a.status IN ('active', 'completed');

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Peer review not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_result;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role text := CASE lower(coalesce(NEW.raw_user_meta_data->>'role', ''))
                   WHEN 'teacher' THEN 'teacher'
                   WHEN 'institution' THEN 'institution_admin'
                   WHEN 'institution_admin' THEN 'institution_admin'
                   ELSE 'student'
                 END;
BEGIN
  BEGIN
    INSERT INTO public.users (id, email, first_name, last_name, role, onboarding_completed)
    VALUES (
      NEW.id,
      NEW.email,
      coalesce(NEW.raw_user_meta_data->>'first_name', ''),
      coalesce(NEW.raw_user_meta_data->>'last_name', ''),
      v_role,
      false
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    -- e.g. a stale users row with the same email. Never block signup over it;
    -- onboarding's upsert will reconcile.
    NULL;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: increment_class_enrollment(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_class_enrollment(class_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE classes 
  SET current_enrollment = current_enrollment + 1 
  WHERE id = class_id;
END;
$$;


--
-- Name: join_class_by_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_class_by_code(p_code text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_class public.classes%ROWTYPE;
  v_enrollment public.enrollments%ROWTYPE;
  v_has_enrollment boolean;
  v_active_count integer;
  v_teacher_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join a class' USING ERRCODE = '42501';
  END IF;

  -- Lock the class row so two students can't both take the last seat.
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

  IF v_class.max_enrollment IS NOT NULL THEN
    SELECT count(*) INTO v_active_count
    FROM public.enrollments
    WHERE class_id = v_class.id AND status IN ('enrolled', 'active');
    IF v_active_count >= v_class.max_enrollment THEN
      RAISE EXCEPTION 'This class has reached its maximum enrollment' USING ERRCODE = '53400';
    END IF;
  END IF;

  IF v_has_enrollment THEN
    -- Re-joining after dropping.
    UPDATE public.enrollments
    SET status = 'enrolled', enrolled_at = now(), updated_at = now()
    WHERE id = v_enrollment.id
    RETURNING * INTO v_enrollment;
  ELSE
    INSERT INTO public.enrollments (class_id, student_id, status, enrolled_at)
    VALUES (v_class.id, v_uid, 'enrolled', now())
    RETURNING * INTO v_enrollment;
  END IF;

  SELECT nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
  INTO v_teacher_name
  FROM public.users WHERE id = v_class.teacher_id;

  RETURN json_build_object(
    'enrollment_id', v_enrollment.id,
    'class_id', v_class.id,
    'class_name', v_class.name,
    'class_description', v_class.description,
    'teacher_name', v_teacher_name,
    'enrolled_at', v_enrollment.enrolled_at
  );
END;
$$;


--
-- Name: log_role_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_role_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO role_audit_log (user_id, action, new_role, changed_by, institution_id, department_id, metadata)
    VALUES (NEW.user_id, 'assigned', NEW.role, NEW.assigned_by, NEW.institution_id, NEW.department_id, 
            jsonb_build_object('assignment_id', NEW.id, 'is_temporary', NEW.is_temporary, 'expires_at', NEW.expires_at));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != NEW.status THEN
      INSERT INTO role_audit_log (user_id, action, old_role, new_role, changed_by, institution_id, department_id, metadata)
      VALUES (NEW.user_id, 
              CASE 
                WHEN NEW.status = 'suspended' THEN 'suspended'
                WHEN NEW.status = 'active' AND OLD.status = 'suspended' THEN 'activated'
                WHEN NEW.status = 'expired' THEN 'expired'
                ELSE 'changed'
              END,
              OLD.role, NEW.role, NEW.assigned_by, NEW.institution_id, NEW.department_id,
              jsonb_build_object('assignment_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO role_audit_log (user_id, action, old_role, changed_by, institution_id, department_id, metadata)
    VALUES (OLD.user_id, 'revoked', OLD.role, OLD.assigned_by, OLD.institution_id, OLD.department_id,
            jsonb_build_object('assignment_id', OLD.id));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: mark_notifications_read(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_notifications_read(p_user_id uuid, p_notification_ids uuid[] DEFAULT NULL::uuid[]) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  IF p_notification_ids IS NULL THEN
    -- Mark all unread notifications as read
    UPDATE notifications 
    SET is_read = TRUE, read_at = NOW()
    WHERE user_id = p_user_id AND is_read = FALSE;
  ELSE
    -- Mark specific notifications as read
    UPDATE notifications 
    SET is_read = TRUE, read_at = NOW()
    WHERE user_id = p_user_id 
    AND id = ANY(p_notification_ids) 
    AND is_read = FALSE;
  END IF;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;


--
-- Name: publish_peer_review(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_peer_review(p_peer_review_assignment_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pra public.peer_review_assignments%ROWTYPE;
  v_n integer;
  v_k integer;
  v_created integer;
BEGIN
  SELECT * INTO v_pra
  FROM public.peer_review_assignments
  WHERE id = p_peer_review_assignment_id
  FOR UPDATE;

  IF NOT FOUND OR v_pra.teacher_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Peer review not found' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.peer_reviews WHERE peer_review_assignment_id = v_pra.id) THEN
    RAISE EXCEPTION 'This peer review has already been published' USING ERRCODE = '23505';
  END IF;

  IF v_pra.end_date IS NOT NULL AND v_pra.end_date < now() THEN
    RAISE EXCEPTION 'The end date for this peer review has already passed' USING ERRCODE = '22023';
  END IF;

  -- Participants: students currently in the class who submitted the work.
  CREATE TEMP TABLE _pr_participants ON COMMIT DROP AS
  SELECT s.student_id, s.id AS submission_id,
         (row_number() OVER (ORDER BY random()))::integer - 1 AS pos
  FROM public.submissions s
  JOIN public.enrollments e
    ON e.student_id = s.student_id
   AND e.class_id = v_pra.class_id
   AND e.status IN ('enrolled', 'active')
  WHERE s.assignment_id = v_pra.assignment_id
    AND s.status IN ('submitted', 'graded');

  SELECT count(*) INTO v_n FROM _pr_participants;
  IF v_n < 2 THEN
    DROP TABLE _pr_participants;
    RAISE EXCEPTION 'At least 2 students must submit this assignment before peer review can start (% so far)', v_n
      USING ERRCODE = '22023';
  END IF;

  v_k := least(greatest(coalesce(v_pra.reviews_per_student, 2), 1), v_n - 1);

  -- Balanced circle: the student at position i reviews positions i+1..i+k.
  INSERT INTO public.peer_reviews
    (peer_review_assignment_id, reviewer_id, reviewee_id, submission_id, status)
  SELECT v_pra.id, r.student_id, t.student_id, t.submission_id, 'pending'
  FROM _pr_participants r
  CROSS JOIN generate_series(1, v_k) AS g(k)
  JOIN _pr_participants t ON t.pos = (r.pos + g.k) % v_n;
  GET DIAGNOSTICS v_created = ROW_COUNT;

  DROP TABLE _pr_participants;

  UPDATE public.peer_review_assignments
  SET status = 'active',
      start_date = coalesce(start_date, now()),
      updated_at = now()
  WHERE id = v_pra.id;

  INSERT INTO public.peer_review_activity (peer_review_assignment_id, user_id, activity_type, details)
  VALUES (v_pra.id, v_uid, 'assignment_published',
          json_build_object('students', v_n, 'reviews_per_student', v_k)::jsonb);

  RETURN json_build_object('students', v_n, 'reviews_per_student', v_k, 'reviews_created', v_created);
END;
$$;


--
-- Name: rate_peer_review_helpfulness(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rate_peer_review_helpfulness(p_review_id uuid, p_rating integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5' USING ERRCODE = '22023';
  END IF;

  UPDATE public.peer_reviews
  SET helpfulness_rating = p_rating, updated_at = now()
  WHERE id = p_review_id
    AND reviewee_id = auth.uid()
    AND status = 'completed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Peer review not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;


--
-- Name: request_role(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_role(p_requested_role text, p_justification text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_me public.users%ROWTYPE;
  v_id uuid;
  v_label text;
BEGIN
  SELECT * INTO v_me FROM public.users WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '42501';
  END IF;
  IF v_me.institution_id IS NULL THEN
    RAISE EXCEPTION 'You need to belong to an institution to request a role' USING ERRCODE = '22023';
  END IF;
  IF p_requested_role NOT IN ('teacher', 'institution_admin') THEN
    RAISE EXCEPTION 'You can request the teacher or institution admin role' USING ERRCODE = '22023';
  END IF;
  IF p_requested_role = v_me.role THEN
    RAISE EXCEPTION 'You already have this role' USING ERRCODE = '22023';
  END IF;
  IF coalesce(trim(p_justification), '') = '' THEN
    RAISE EXCEPTION 'Please explain why you need this role' USING ERRCODE = '22023';
  END IF;
  IF length(p_justification) > 2000 THEN
    RAISE EXCEPTION 'Please keep the explanation under 2000 characters' USING ERRCODE = '22023';
  END IF;

  -- Close requests that expired while nobody reviewed them.
  UPDATE public.role_requests
  SET status = 'expired'
  WHERE user_id = v_uid AND status = 'pending' AND expires_at <= now();

  IF EXISTS (SELECT 1 FROM public.role_requests WHERE user_id = v_uid AND status = 'pending') THEN
    RAISE EXCEPTION 'You already have a pending role request' USING ERRCODE = '23505';
  END IF;
  IF (SELECT count(*) FROM public.role_requests
      WHERE user_id = v_uid AND requested_at > now() - interval '1 day') >= 3 THEN
    RAISE EXCEPTION 'Too many role requests today. Please try again tomorrow.' USING ERRCODE = '53400';
  END IF;

  INSERT INTO public.role_requests
    (user_id, requested_role, existing_role, justification, status, requested_at,
     verification_method, institution_id, department_id, expires_at)
  VALUES
    (v_uid, p_requested_role, v_me.role, trim(p_justification), 'pending', now(),
     'admin_approval', v_me.institution_id, v_me.department_id, now() + interval '30 days')
  RETURNING id INTO v_id;

  v_label := CASE p_requested_role WHEN 'institution_admin' THEN 'institution admin' ELSE p_requested_role END;

  INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, action_label, metadata)
  SELECT a.id, 'system_message', 'New role request',
         coalesce(nullif(trim(coalesce(v_me.first_name, '') || ' ' || coalesce(v_me.last_name, '')), ''), v_me.email)
           || ' asked to become ' || v_label || '.',
         'medium', '/dashboard/institution/role-requests', 'Review',
         jsonb_build_object('role_request_id', v_id)
  FROM public.users a
  WHERE a.institution_id = v_me.institution_id
    AND a.role = 'institution_admin'
    AND a.id <> v_uid;

  RETURN v_id;
END;
$$;


--
-- Name: review_role_request(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.review_role_request(p_request_id uuid, p_approve boolean, p_notes text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.role_requests%ROWTYPE;
  v_target public.users%ROWTYPE;
  v_label text;
BEGIN
  SELECT * INTO v_req FROM public.role_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR NOT app_private.is_institution_admin_of(v_req.institution_id) THEN
    RAISE EXCEPTION 'Role request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.user_id = v_uid THEN
    RAISE EXCEPTION 'You can''t review your own request' USING ERRCODE = '42501';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been %', v_req.status USING ERRCODE = '22023';
  END IF;
  -- (Expired requests stay 'pending' until the requester's next request_role()
  -- closes them; the admin page already hides them.)
  IF v_req.expires_at <= now() THEN
    RAISE EXCEPTION 'This request has expired' USING ERRCODE = '22023';
  END IF;
  IF p_notes IS NOT NULL AND length(p_notes) > 2000 THEN
    RAISE EXCEPTION 'Please keep notes under 2000 characters' USING ERRCODE = '22023';
  END IF;

  v_label := CASE v_req.requested_role WHEN 'institution_admin' THEN 'institution admin' ELSE v_req.requested_role END;

  IF p_approve THEN
    SELECT * INTO v_target FROM public.users WHERE id = v_req.user_id FOR UPDATE;
    IF NOT FOUND OR v_target.institution_id IS DISTINCT FROM v_req.institution_id THEN
      RAISE EXCEPTION 'This person is no longer a member of your institution' USING ERRCODE = '22023';
    END IF;
    IF v_target.role IS DISTINCT FROM v_req.existing_role THEN
      RAISE EXCEPTION 'Their role has changed since they asked (now %). Deny this request and ask them to request again.', v_target.role
        USING ERRCODE = '22023';
    END IF;

    -- Runs as the reviewing admin, so the users guard trigger applies too.
    UPDATE public.users
    SET role = v_req.requested_role, updated_at = now()
    WHERE id = v_target.id;

    INSERT INTO public.role_audit_log
      (user_id, action, old_role, new_role, changed_by, reason, timestamp, institution_id, department_id, metadata)
    VALUES
      (v_target.id, 'changed', v_req.existing_role, v_req.requested_role, v_uid,
       coalesce(nullif(trim(p_notes), ''), 'Role request approved'), now(),
       v_req.institution_id, v_target.department_id,
       jsonb_build_object('role_request_id', v_req.id));
  END IF;

  UPDATE public.role_requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,
      reviewed_at = now(),
      reviewed_by = v_uid,
      review_notes = nullif(trim(coalesce(p_notes, '')), '')
  WHERE id = v_req.id;

  INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, metadata)
  VALUES (
    v_req.user_id,
    CASE WHEN p_approve THEN 'role_changed' ELSE 'system_message' END,
    CASE WHEN p_approve THEN 'Role request approved' ELSE 'Role request denied' END,
    CASE WHEN p_approve THEN 'You are now ' || CASE WHEN v_label = 'institution admin' THEN 'an ' ELSE 'a ' END || v_label || '.'
         ELSE 'Your request to become ' || v_label || ' was denied.'
    END || coalesce(' Note: ' || nullif(trim(p_notes), ''), ''),
    'high',
    '/dashboard/profile',
    jsonb_build_object('role_request_id', v_req.id)
  );
END;
$$;


--
-- Name: save_peer_review(uuid, integer, jsonb, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_peer_review(p_review_id uuid, p_overall_rating integer, p_feedback jsonb, p_minutes integer, p_submit boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pr public.peer_reviews%ROWTYPE;
  v_a public.peer_review_assignments%ROWTYPE;
  v_scale integer;
BEGIN
  SELECT * INTO v_pr FROM public.peer_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND OR v_pr.reviewer_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Peer review not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_a FROM public.peer_review_assignments WHERE id = v_pr.peer_review_assignment_id;
  IF v_a.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'This peer review is not open' USING ERRCODE = '22023';
  END IF;
  IF v_a.end_date IS NOT NULL AND now() > v_a.end_date THEN
    RAISE EXCEPTION 'The deadline for this peer review has passed' USING ERRCODE = '22023';
  END IF;
  IF v_pr.status = 'completed' THEN
    RAISE EXCEPTION 'This review has already been submitted' USING ERRCODE = '22023';
  END IF;

  v_scale := coalesce((v_a.settings->>'rating_scale')::integer, 5);
  IF p_overall_rating IS NOT NULL AND (p_overall_rating < 1 OR p_overall_rating > v_scale) THEN
    RAISE EXCEPTION 'Rating must be between 1 and %', v_scale USING ERRCODE = '22023';
  END IF;

  IF p_submit THEN
    IF coalesce((v_a.settings->>'require_rating')::boolean, false) AND p_overall_rating IS NULL THEN
      RAISE EXCEPTION 'Please provide a rating before submitting' USING ERRCODE = '22023';
    END IF;
    IF coalesce(trim(p_feedback->>'overall_comments'), '') = '' THEN
      RAISE EXCEPTION 'Please provide overall comments before submitting' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.peer_reviews
  SET status = CASE WHEN p_submit THEN 'completed' ELSE 'in_progress' END,
      overall_rating = p_overall_rating,
      feedback = coalesce(p_feedback, '{}'::jsonb),
      time_spent = coalesce(time_spent, 0) + least(greatest(coalesce(p_minutes, 0), 0), 120),
      submitted_at = CASE WHEN p_submit THEN now() ELSE submitted_at END,
      updated_at = now()
  WHERE id = v_pr.id;

  IF p_submit THEN
    INSERT INTO public.peer_review_activity
      (peer_review_assignment_id, peer_review_id, user_id, activity_type, details)
    VALUES (v_a.id, v_pr.id, v_uid, 'review_submitted',
            json_build_object('rating', p_overall_rating)::jsonb);
  END IF;
END;
$$;


--
-- Name: update_class_enrollment_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_class_enrollment_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.classes 
        SET enrollment_count = (
            SELECT COUNT(*) 
            FROM public.enrollments 
            WHERE class_id = NEW.class_id 
            AND status = 'enrolled'
        )
        WHERE id = NEW.class_id;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE public.classes 
        SET enrollment_count = (
            SELECT COUNT(*) 
            FROM public.enrollments 
            WHERE class_id = NEW.class_id 
            AND status = 'enrolled'
        )
        WHERE id = NEW.class_id;
        
        IF OLD.class_id != NEW.class_id THEN
            UPDATE public.classes 
            SET enrollment_count = (
                SELECT COUNT(*) 
                FROM public.enrollments 
                WHERE class_id = OLD.class_id 
                AND status = 'enrolled'
            )
            WHERE id = OLD.class_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.classes 
        SET enrollment_count = (
            SELECT COUNT(*) 
            FROM public.enrollments 
            WHERE class_id = OLD.class_id 
            AND status = 'enrolled'
        )
        WHERE id = OLD.class_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;


--
-- Name: update_enrollment_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_enrollment_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.classes
    SET enrollment_count = coalesce(enrollment_count, 0) + 1
    WHERE id = NEW.class_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.classes
    SET enrollment_count = greatest(coalesce(enrollment_count, 1) - 1, 0)
    WHERE id = OLD.class_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: update_enrollment_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_enrollment_counts() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: update_enrollment_statistics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_enrollment_statistics() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: update_rubric_total_points(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_rubric_total_points() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE public.rubrics 
    SET total_points = (
        SELECT COALESCE(SUM(
            (SELECT MAX(points) FROM public.rubric_levels WHERE criterion_id = rc.id)
        ), 0)
        FROM public.rubric_criteria rc 
        WHERE rc.rubric_id = COALESCE(NEW.rubric_id, OLD.rubric_id)
    ),
    updated_at = NOW()
    WHERE id = COALESCE(NEW.rubric_id, OLD.rubric_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_waitlist_positions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_waitlist_positions() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: validate_role_transition(uuid, uuid, character varying, character varying, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_role_transition(p_institution_id uuid, p_user_id uuid, p_from_role character varying, p_to_role character varying, p_department_id uuid DEFAULT NULL::uuid) RETURNS TABLE(is_valid boolean, requires_approval boolean, approval_role character varying, error_message text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  policy_record RECORD;
  user_department_id UUID;
BEGIN
  -- Get user's current department
  SELECT department_id INTO user_department_id 
  FROM users 
  WHERE id = p_user_id;
  
  -- Check for applicable policies
  FOR policy_record IN 
    SELECT * FROM institutional_role_policies 
    WHERE institution_id = p_institution_id 
    AND is_active = TRUE
    AND (from_role IS NULL OR from_role = p_from_role)
    AND (to_role IS NULL OR to_role = p_to_role)
    AND (department_id IS NULL OR department_id = user_department_id OR department_id = p_department_id)
    ORDER BY 
      CASE WHEN from_role IS NOT NULL AND to_role IS NOT NULL THEN 1
           WHEN from_role IS NOT NULL OR to_role IS NOT NULL THEN 2
           ELSE 3 END
  LOOP
    CASE policy_record.policy_type
      WHEN 'role_transition' THEN
        -- Check if transition is allowed
        IF policy_record.conditions ? 'forbidden' AND 
           (policy_record.conditions->'forbidden')::boolean = true THEN
          RETURN QUERY SELECT FALSE, FALSE, NULL::VARCHAR, 
            'Role transition from ' || p_from_role || ' to ' || p_to_role || ' is not allowed';
          RETURN;
        END IF;
        
      WHEN 'department_restriction' THEN
        -- Check department restrictions
        IF policy_record.department_id IS NOT NULL AND 
           policy_record.department_id != user_department_id THEN
          RETURN QUERY SELECT FALSE, FALSE, NULL::VARCHAR,
            'Role assignment restricted for this department';
          RETURN;
        END IF;
        
      WHEN 'approval_required' THEN
        -- Return approval requirement
        RETURN QUERY SELECT TRUE, TRUE, policy_record.approval_role,
          'Approval required from ' || policy_record.approval_role;
        RETURN;
    END CASE;
  END LOOP;
  
  -- If no restricting policies found, allow the transition
  RETURN QUERY SELECT TRUE, FALSE, NULL::VARCHAR, NULL::TEXT;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    class_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    due_date timestamp with time zone,
    status text DEFAULT 'draft'::text NOT NULL,
    submission_count integer DEFAULT 0,
    total_students integer DEFAULT 0,
    points integer DEFAULT 100,
    instructions text,
    rubric jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    points_possible integer DEFAULT 100,
    rubric_id uuid,
    CONSTRAINT assignments_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'closed'::text]))),
    CONSTRAINT points_possible_non_negative CHECK ((points_possible >= 0))
);


--
-- Name: bulk_imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bulk_imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    initiated_by uuid NOT NULL,
    file_name character varying(255) NOT NULL,
    file_size bigint NOT NULL,
    file_type character varying(20) NOT NULL,
    total_records integer DEFAULT 0 NOT NULL,
    processed_records integer DEFAULT 0,
    successful_records integer DEFAULT 0,
    failed_records integer DEFAULT 0,
    status character varying(20) DEFAULT 'processing'::character varying,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    error_report jsonb DEFAULT '{}'::jsonb,
    validation_report jsonb DEFAULT '{}'::jsonb,
    import_options jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bulk_imports_file_type_check CHECK (((file_type)::text = ANY ((ARRAY['csv'::character varying, 'excel'::character varying, 'json'::character varying])::text[]))),
    CONSTRAINT bulk_imports_status_check CHECK (((status)::text = ANY ((ARRAY['processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying, 'validating'::character varying])::text[])))
);


--
-- Name: bulk_role_assignment_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bulk_role_assignment_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bulk_assignment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    previous_role character varying(50),
    target_role character varying(50) NOT NULL,
    assignment_status character varying(50) DEFAULT 'pending'::character varying,
    error_message text,
    error_code character varying(100),
    conflict_details jsonb DEFAULT '{}'::jsonb,
    assigned_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bulk_role_assignment_items_assignment_status_check CHECK (((assignment_status)::text = ANY ((ARRAY['pending'::character varying, 'success'::character varying, 'failed'::character varying, 'skipped'::character varying, 'conflict'::character varying])::text[])))
);


--
-- Name: bulk_role_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bulk_role_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    initiated_by uuid NOT NULL,
    assignment_name character varying(255) NOT NULL,
    target_role character varying(50) NOT NULL,
    department_id uuid,
    total_users integer DEFAULT 0 NOT NULL,
    processed_users integer DEFAULT 0,
    successful_assignments integer DEFAULT 0,
    failed_assignments integer DEFAULT 0,
    skipped_assignments integer DEFAULT 0,
    status character varying(50) DEFAULT 'processing'::character varying,
    is_temporary boolean DEFAULT false,
    expires_at timestamp with time zone,
    justification text,
    validation_errors jsonb DEFAULT '[]'::jsonb,
    assignment_options jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bulk_role_assignments_status_check CHECK (((status)::text = ANY ((ARRAY['processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying, 'validating'::character varying])::text[]))),
    CONSTRAINT bulk_role_assignments_target_role_check CHECK (((target_role)::text = ANY ((ARRAY['student'::character varying, 'teacher'::character varying, 'department_admin'::character varying, 'institution_admin'::character varying])::text[])))
);


--
-- Name: class_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    student_id uuid,
    email character varying,
    invited_by uuid NOT NULL,
    token character varying NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    accepted_at timestamp without time zone,
    declined_at timestamp without time zone,
    message text,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT class_invitations_check CHECK (((student_id IS NOT NULL) OR (email IS NOT NULL)))
);


--
-- Name: class_prerequisites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_prerequisites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    type character varying NOT NULL,
    requirement text NOT NULL,
    description text,
    strict boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT class_prerequisites_type_check CHECK (((type)::text = ANY ((ARRAY['course'::character varying, 'grade'::character varying, 'year'::character varying, 'major'::character varying, 'gpa'::character varying, 'custom'::character varying])::text[])))
);


--
-- Name: classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    code text NOT NULL,
    teacher_id uuid NOT NULL,
    institution_id uuid,
    department_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    enrollment_count integer DEFAULT 0,
    max_enrollment integer,
    semester text,
    schedule text,
    location text,
    credits integer DEFAULT 3,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT classes_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text])))
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    institution_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: enrollment_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollment_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    class_id uuid NOT NULL,
    action character varying NOT NULL,
    performed_by uuid,
    reason text,
    previous_status character varying,
    new_status character varying,
    "timestamp" timestamp without time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address inet,
    user_agent text,
    CONSTRAINT enrollment_audit_log_action_check CHECK (((action)::text = ANY ((ARRAY['enrolled'::character varying, 'dropped'::character varying, 'withdrawn'::character varying, 'waitlisted'::character varying, 'approved'::character varying, 'denied'::character varying, 'invited'::character varying, 'transferred'::character varying])::text[])))
);


--
-- Name: enrollment_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollment_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    class_id uuid NOT NULL,
    requested_at timestamp without time zone DEFAULT now(),
    status character varying DEFAULT 'pending'::character varying,
    reviewed_at timestamp without time zone,
    reviewed_by uuid,
    review_notes text,
    justification text,
    priority integer DEFAULT 0,
    expires_at timestamp without time zone DEFAULT (now() + '7 days'::interval),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT enrollment_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'denied'::character varying, 'expired'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: enrollment_restrictions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollment_restrictions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    type character varying NOT NULL,
    condition text NOT NULL,
    description text,
    overridable boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT enrollment_restrictions_type_check CHECK (((type)::text = ANY ((ARRAY['year_level'::character varying, 'major'::character varying, 'department'::character varying, 'gpa'::character varying, 'institution'::character varying, 'custom'::character varying])::text[])))
);


--
-- Name: enrollment_statistics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollment_statistics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    total_enrolled integer DEFAULT 0,
    total_waitlisted integer DEFAULT 0,
    total_pending integer DEFAULT 0,
    capacity_utilization numeric DEFAULT 0.0,
    average_wait_time interval,
    enrollment_trend character varying DEFAULT 'stable'::character varying,
    last_updated timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    student_id uuid NOT NULL,
    status text DEFAULT 'enrolled'::text NOT NULL,
    enrolled_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT enrollments_status_not_empty CHECK (((status IS NOT NULL) AND (length(TRIM(BOTH FROM status)) > 0))),
    CONSTRAINT enrollments_status_valid CHECK (((status IS NOT NULL) AND (length(status) > 0)))
);


--
-- Name: import_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_errors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    import_id uuid NOT NULL,
    row_number integer NOT NULL,
    error_type character varying(100) NOT NULL,
    error_message text NOT NULL,
    field_name character varying(100),
    field_value text,
    raw_data jsonb NOT NULL,
    suggested_fix text,
    is_fixable boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: import_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    import_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    notification_type character varying(20) NOT NULL,
    subject character varying(255) NOT NULL,
    message text NOT NULL,
    sent_at timestamp with time zone,
    delivery_status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT import_notifications_delivery_status_check CHECK (((delivery_status)::text = ANY ((ARRAY['pending'::character varying, 'sent'::character varying, 'failed'::character varying])::text[]))),
    CONSTRAINT import_notifications_notification_type_check CHECK (((notification_type)::text = ANY ((ARRAY['started'::character varying, 'completed'::character varying, 'failed'::character varying, 'warning'::character varying])::text[])))
);


--
-- Name: import_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    import_id uuid NOT NULL,
    stage character varying(100) NOT NULL,
    current_step integer DEFAULT 0,
    total_steps integer DEFAULT 0,
    progress_percentage numeric(5,2) DEFAULT 0.00,
    status_message text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: import_warnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_warnings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    import_id uuid NOT NULL,
    row_number integer NOT NULL,
    warning_type character varying(100) NOT NULL,
    warning_message text NOT NULL,
    field_name character varying(100),
    field_value text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: institution_domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institution_domains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    domain character varying NOT NULL,
    verified boolean DEFAULT false,
    auto_approve_roles character varying[] DEFAULT '{}'::character varying[],
    created_at timestamp without time zone DEFAULT now(),
    verified_at timestamp without time zone,
    verified_by uuid,
    CONSTRAINT chk_institution_domains_domain CHECK (((domain)::text ~ '^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}$'::text)),
    CONSTRAINT chk_institution_domains_verified_at CHECK (((verified_at IS NULL) OR ((verified = true) AND (verified_at IS NOT NULL))))
);


--
-- Name: TABLE institution_domains; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.institution_domains IS 'Manages verified email domains for automatic role approval';


--
-- Name: COLUMN institution_domains.auto_approve_roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.institution_domains.auto_approve_roles IS 'Array of roles that can be auto-approved for this domain';


--
-- Name: institutional_role_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institutional_role_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    policy_name character varying(255) NOT NULL,
    policy_type character varying(100) NOT NULL,
    from_role character varying(50),
    to_role character varying(50),
    department_id uuid,
    requires_approval boolean DEFAULT false,
    approval_role character varying(50),
    max_temporary_duration integer,
    conditions jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT institutional_role_policies_policy_type_check CHECK (((policy_type)::text = ANY ((ARRAY['role_transition'::character varying, 'department_restriction'::character varying, 'approval_required'::character varying, 'temporary_role_limit'::character varying])::text[])))
);


--
-- Name: institutions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institutions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    domain text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    CONSTRAINT institutions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- Name: invitation_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitation_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invitation_id uuid NOT NULL,
    action character varying NOT NULL,
    performed_by uuid,
    "timestamp" timestamp without time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address inet,
    user_agent text,
    CONSTRAINT invitation_audit_log_action_check CHECK (((action)::text = ANY ((ARRAY['created'::character varying, 'accepted'::character varying, 'declined'::character varying, 'revoked'::character varying, 'expired'::character varying])::text[])))
);


--
-- Name: migration_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    import_id uuid,
    snapshot_type character varying(50) NOT NULL,
    original_data jsonb NOT NULL,
    imported_records jsonb DEFAULT '[]'::jsonb,
    rollback_data jsonb DEFAULT '{}'::jsonb,
    is_rolled_back boolean DEFAULT false,
    rollback_date timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT migration_snapshots_snapshot_type_check CHECK (((snapshot_type)::text = ANY ((ARRAY['user_import'::character varying, 'course_import'::character varying, 'full_migration'::character varying])::text[])))
);


--
-- Name: notification_delivery_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_delivery_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notification_id uuid NOT NULL,
    delivery_method character varying(20) NOT NULL,
    delivery_status character varying(20) DEFAULT 'pending'::character varying,
    delivery_attempts integer DEFAULT 0,
    delivered_at timestamp with time zone,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notification_delivery_log_delivery_method_check CHECK (((delivery_method)::text = ANY ((ARRAY['email'::character varying, 'push'::character varying, 'sms'::character varying])::text[]))),
    CONSTRAINT notification_delivery_log_delivery_status_check CHECK (((delivery_status)::text = ANY ((ARRAY['pending'::character varying, 'sent'::character varying, 'delivered'::character varying, 'failed'::character varying, 'bounced'::character varying])::text[])))
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email_notifications boolean DEFAULT true,
    push_notifications boolean DEFAULT true,
    assignment_notifications boolean DEFAULT true,
    grade_notifications boolean DEFAULT true,
    announcement_notifications boolean DEFAULT true,
    system_notifications boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    priority character varying(20) DEFAULT 'medium'::character varying,
    is_read boolean DEFAULT false,
    action_url text,
    action_label character varying(100),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    read_at timestamp with time zone,
    expires_at timestamp with time zone,
    CONSTRAINT notifications_action_url_internal CHECK (((action_url IS NULL) OR ((action_url ~ '^/'::text) AND (action_url !~ '^//'::text) AND (action_url !~ '^/\\'::text)))),
    CONSTRAINT notifications_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'urgent'::character varying])::text[]))),
    CONSTRAINT notifications_type_check CHECK (((type)::text = ANY ((ARRAY['assignment_created'::character varying, 'assignment_graded'::character varying, 'assignment_due_soon'::character varying, 'assignment_submitted'::character varying, 'class_announcement'::character varying, 'class_created'::character varying, 'enrollment_approved'::character varying, 'role_changed'::character varying, 'system_message'::character varying])::text[])))
);


--
-- Name: onboarding_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    current_step integer DEFAULT 0,
    total_steps integer DEFAULT 5,
    data jsonb DEFAULT '{}'::jsonb,
    started_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone,
    last_activity timestamp without time zone DEFAULT now()
);


--
-- Name: peer_review_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.peer_review_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    peer_review_assignment_id uuid NOT NULL,
    peer_review_id uuid,
    user_id uuid NOT NULL,
    activity_type text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT peer_review_activity_activity_type_check CHECK ((activity_type = ANY (ARRAY['review_submitted'::text, 'review_flagged'::text, 'review_completed'::text, 'assignment_created'::text, 'assignment_published'::text])))
);


--
-- Name: peer_review_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.peer_review_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    assignment_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    class_id uuid NOT NULL,
    review_type text DEFAULT 'anonymous'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    reviews_per_student integer DEFAULT 2,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    instructions text,
    rubric jsonb DEFAULT '{}'::jsonb,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT peer_review_assignments_review_type_check CHECK ((review_type = ANY (ARRAY['anonymous'::text, 'named'::text, 'blind'::text]))),
    CONSTRAINT peer_review_assignments_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: peer_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.peer_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    peer_review_assignment_id uuid NOT NULL,
    reviewer_id uuid NOT NULL,
    reviewee_id uuid NOT NULL,
    submission_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    overall_rating integer,
    feedback jsonb DEFAULT '{}'::jsonb,
    time_spent integer DEFAULT 0,
    helpfulness_rating integer,
    is_flagged boolean DEFAULT false,
    flag_reason text,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT peer_reviews_helpfulness_rating_check CHECK (((helpfulness_rating >= 1) AND (helpfulness_rating <= 5))),
    CONSTRAINT peer_reviews_overall_rating_check CHECK (((overall_rating IS NULL) OR ((overall_rating >= 1) AND (overall_rating <= 10)))),
    CONSTRAINT peer_reviews_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'flagged'::text])))
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    description text,
    category character varying NOT NULL,
    scope character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT chk_permissions_category CHECK (((category)::text = ANY ((ARRAY['content'::character varying, 'user_management'::character varying, 'analytics'::character varying, 'system'::character varying])::text[]))),
    CONSTRAINT chk_permissions_name CHECK (((name)::text ~ '^[a-z][a-z0-9_]*[a-z0-9]$'::text)),
    CONSTRAINT chk_permissions_scope CHECK (((scope)::text = ANY ((ARRAY['self'::character varying, 'department'::character varying, 'institution'::character varying, 'system'::character varying])::text[])))
);


--
-- Name: TABLE permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.permissions IS 'Defines granular permissions available in the system';


--
-- Name: COLUMN permissions.scope; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.permissions.scope IS 'Scope of the permission (self, department, institution, system)';


--
-- Name: role_assignment_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_assignment_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    institution_id uuid NOT NULL,
    bulk_assignment_id uuid,
    action character varying(100) NOT NULL,
    previous_role character varying(50),
    assigned_role character varying(50),
    changed_by uuid NOT NULL,
    change_reason text,
    is_temporary boolean DEFAULT false,
    expires_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: role_assignment_conflicts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_assignment_conflicts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bulk_assignment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    conflict_type character varying(100) NOT NULL,
    conflict_description text NOT NULL,
    existing_role character varying(50),
    target_role character varying(50),
    resolution_status character varying(50) DEFAULT 'unresolved'::character varying,
    resolution_action character varying(100),
    resolved_by uuid,
    resolved_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT role_assignment_conflicts_resolution_status_check CHECK (((resolution_status)::text = ANY ((ARRAY['unresolved'::character varying, 'resolved'::character varying, 'ignored'::character varying])::text[])))
);


--
-- Name: role_assignment_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_assignment_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bulk_assignment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    notification_type character varying(50) NOT NULL,
    subject character varying(255) NOT NULL,
    message text NOT NULL,
    delivery_status character varying(50) DEFAULT 'pending'::character varying,
    sent_at timestamp with time zone,
    delivery_attempts integer DEFAULT 0,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT role_assignment_notifications_delivery_status_check CHECK (((delivery_status)::text = ANY ((ARRAY['pending'::character varying, 'sent'::character varying, 'failed'::character varying, 'bounced'::character varying])::text[]))),
    CONSTRAINT role_assignment_notifications_notification_type_check CHECK (((notification_type)::text = ANY ((ARRAY['role_assigned'::character varying, 'role_changed'::character varying, 'temporary_role_assigned'::character varying, 'role_expired'::character varying])::text[])))
);


--
-- Name: role_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    action character varying NOT NULL,
    old_role character varying,
    new_role character varying,
    changed_by uuid,
    reason text,
    "timestamp" timestamp without time zone DEFAULT now(),
    institution_id uuid,
    department_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT chk_role_audit_log_action CHECK (((action)::text = ANY ((ARRAY['assigned'::character varying, 'revoked'::character varying, 'changed'::character varying, 'expired'::character varying, 'suspended'::character varying, 'activated'::character varying])::text[]))),
    CONSTRAINT chk_role_audit_log_new_role CHECK (((new_role IS NULL) OR ((new_role)::text = ANY ((ARRAY['student'::character varying, 'teacher'::character varying, 'department_admin'::character varying, 'institution_admin'::character varying, 'system_admin'::character varying])::text[])))),
    CONSTRAINT chk_role_audit_log_old_role CHECK (((old_role IS NULL) OR ((old_role)::text = ANY ((ARRAY['student'::character varying, 'teacher'::character varying, 'department_admin'::character varying, 'institution_admin'::character varying, 'system_admin'::character varying])::text[]))))
);


--
-- Name: TABLE role_audit_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.role_audit_log IS 'Comprehensive audit trail for all role-related changes';


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role character varying NOT NULL,
    permission_id uuid NOT NULL,
    conditions jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT chk_role_permissions_role CHECK (((role)::text = ANY ((ARRAY['student'::character varying, 'teacher'::character varying, 'department_admin'::character varying, 'institution_admin'::character varying, 'system_admin'::character varying])::text[])))
);


--
-- Name: TABLE role_permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.role_permissions IS 'Maps roles to their associated permissions';


--
-- Name: COLUMN role_permissions.conditions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.role_permissions.conditions IS 'Additional conditions for when this permission applies';


--
-- Name: role_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    requested_role character varying NOT NULL,
    existing_role character varying,
    justification text,
    status character varying DEFAULT 'pending'::character varying,
    requested_at timestamp without time zone DEFAULT now(),
    reviewed_at timestamp without time zone,
    reviewed_by uuid,
    review_notes text,
    verification_method character varying,
    institution_id uuid NOT NULL,
    department_id uuid,
    expires_at timestamp without time zone DEFAULT (now() + '7 days'::interval),
    CONSTRAINT chk_role_requests_existing_role CHECK (((existing_role IS NULL) OR ((existing_role)::text = ANY ((ARRAY['student'::character varying, 'teacher'::character varying, 'department_admin'::character varying, 'institution_admin'::character varying, 'system_admin'::character varying])::text[])))),
    CONSTRAINT chk_role_requests_expires_at CHECK ((expires_at > requested_at)),
    CONSTRAINT chk_role_requests_requested_role CHECK (((requested_role)::text = ANY ((ARRAY['student'::character varying, 'teacher'::character varying, 'department_admin'::character varying, 'institution_admin'::character varying, 'system_admin'::character varying])::text[]))),
    CONSTRAINT chk_role_requests_reviewed_at CHECK (((reviewed_at IS NULL) OR (reviewed_at >= requested_at))),
    CONSTRAINT chk_role_requests_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'denied'::character varying, 'expired'::character varying])::text[]))),
    CONSTRAINT chk_role_requests_verification_method CHECK (((verification_method)::text = ANY ((ARRAY['email_domain'::character varying, 'manual_review'::character varying, 'admin_approval'::character varying])::text[])))
);


--
-- Name: TABLE role_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.role_requests IS 'Manages role change requests and approval workflows';


--
-- Name: COLUMN role_requests.verification_method; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.role_requests.verification_method IS 'Method used to verify the role request (email_domain, manual_review, admin_approval)';


--
-- Name: rubric_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rubric_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rubric_id uuid NOT NULL,
    assignment_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: rubric_criteria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rubric_criteria (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rubric_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    weight numeric(5,2) DEFAULT 25.00,
    order_index integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: rubric_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rubric_levels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    criterion_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    points integer NOT NULL,
    order_index integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: rubric_quality_indicators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rubric_quality_indicators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    level_id uuid NOT NULL,
    indicator text NOT NULL,
    order_index integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: rubric_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rubric_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    category text NOT NULL,
    template_data jsonb NOT NULL,
    is_public boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: rubrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rubrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    teacher_id uuid NOT NULL,
    class_id uuid,
    is_template boolean DEFAULT false,
    status text DEFAULT 'active'::text NOT NULL,
    total_points integer DEFAULT 0,
    usage_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT rubrics_status_check CHECK ((status = ANY (ARRAY['active'::text, 'draft'::text, 'archived'::text])))
);


--
-- Name: submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    student_id uuid NOT NULL,
    content text,
    file_url text,
    link_url text,
    submitted_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'submitted'::text NOT NULL,
    grade integer,
    feedback text,
    graded_at timestamp with time zone,
    graded_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    rubric_scores jsonb,
    CONSTRAINT submissions_grade_check CHECK (((grade >= 0) AND (grade <= 100))),
    CONSTRAINT submissions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'graded'::text])))
);


--
-- Name: COLUMN submissions.rubric_scores; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.submissions.rubric_scores IS 'Stores rubric grading data';


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    id uuid NOT NULL,
    onboarding_completed boolean DEFAULT false,
    onboarding_data jsonb DEFAULT '{}'::jsonb,
    onboarding_step integer DEFAULT 0,
    institution_id uuid,
    department_id uuid,
    display_name character varying,
    avatar_url character varying,
    role character varying DEFAULT 'student'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: user_role_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_role_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role character varying NOT NULL,
    status character varying DEFAULT 'active'::character varying,
    assigned_by uuid,
    assigned_at timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone,
    department_id uuid,
    institution_id uuid NOT NULL,
    is_temporary boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT chk_user_role_assignments_expires_at CHECK (((expires_at IS NULL) OR (expires_at > assigned_at))),
    CONSTRAINT chk_user_role_assignments_role CHECK (((role)::text = ANY ((ARRAY['student'::character varying, 'teacher'::character varying, 'department_admin'::character varying, 'institution_admin'::character varying, 'system_admin'::character varying])::text[]))),
    CONSTRAINT chk_user_role_assignments_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'pending'::character varying, 'suspended'::character varying, 'expired'::character varying])::text[])))
);


--
-- Name: TABLE user_role_assignments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_role_assignments IS 'Stores role assignments for users with support for multiple roles, temporary assignments, and expiration';


--
-- Name: COLUMN user_role_assignments.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_role_assignments.expires_at IS 'When this role assignment expires (NULL for permanent assignments)';


--
-- Name: COLUMN user_role_assignments.is_temporary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_role_assignments.is_temporary IS 'Indicates if this is a temporary role assignment that will expire';


--
-- Name: COLUMN user_role_assignments.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_role_assignments.metadata IS 'Additional metadata about the role assignment';


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email text NOT NULL,
    first_name text,
    last_name text,
    role text DEFAULT 'student'::text NOT NULL,
    institution_id uuid,
    department_id uuid,
    onboarding_completed boolean DEFAULT false,
    onboarding_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['student'::text, 'teacher'::text, 'institution_admin'::text, 'department_admin'::text, 'system_admin'::text])))
);


--
-- Name: waitlist_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waitlist_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    class_id uuid NOT NULL,
    "position" integer NOT NULL,
    added_at timestamp without time zone DEFAULT now(),
    notified_at timestamp without time zone,
    notification_expires_at timestamp without time zone,
    priority integer DEFAULT 0,
    estimated_probability numeric DEFAULT 0.0,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: waitlist_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waitlist_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    waitlist_entry_id uuid NOT NULL,
    notification_type character varying NOT NULL,
    sent_at timestamp without time zone DEFAULT now(),
    response_deadline timestamp without time zone,
    responded boolean DEFAULT false,
    response character varying,
    response_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT waitlist_notifications_notification_type_check CHECK (((notification_type)::text = ANY ((ARRAY['position_change'::character varying, 'enrollment_available'::character varying, 'deadline_reminder'::character varying, 'final_notice'::character varying])::text[]))),
    CONSTRAINT waitlist_notifications_response_check CHECK (((response)::text = ANY ((ARRAY['accept'::character varying, 'decline'::character varying, 'no_response'::character varying])::text[])))
);


--
-- Name: assignments assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_pkey PRIMARY KEY (id);


--
-- Name: bulk_imports bulk_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_imports
    ADD CONSTRAINT bulk_imports_pkey PRIMARY KEY (id);


--
-- Name: bulk_role_assignment_items bulk_role_assignment_items_bulk_assignment_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_role_assignment_items
    ADD CONSTRAINT bulk_role_assignment_items_bulk_assignment_id_user_id_key UNIQUE (bulk_assignment_id, user_id);


--
-- Name: bulk_role_assignment_items bulk_role_assignment_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_role_assignment_items
    ADD CONSTRAINT bulk_role_assignment_items_pkey PRIMARY KEY (id);


--
-- Name: bulk_role_assignments bulk_role_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_role_assignments
    ADD CONSTRAINT bulk_role_assignments_pkey PRIMARY KEY (id);


--
-- Name: class_invitations class_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_invitations
    ADD CONSTRAINT class_invitations_pkey PRIMARY KEY (id);


--
-- Name: class_invitations class_invitations_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_invitations
    ADD CONSTRAINT class_invitations_token_key UNIQUE (token);


--
-- Name: class_prerequisites class_prerequisites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_prerequisites
    ADD CONSTRAINT class_prerequisites_pkey PRIMARY KEY (id);


--
-- Name: classes classes_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_code_unique UNIQUE (code);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: enrollment_audit_log enrollment_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_audit_log
    ADD CONSTRAINT enrollment_audit_log_pkey PRIMARY KEY (id);


--
-- Name: enrollment_requests enrollment_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_requests
    ADD CONSTRAINT enrollment_requests_pkey PRIMARY KEY (id);


--
-- Name: enrollment_requests enrollment_requests_student_id_class_id_status_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_requests
    ADD CONSTRAINT enrollment_requests_student_id_class_id_status_key UNIQUE (student_id, class_id, status);


--
-- Name: enrollment_restrictions enrollment_restrictions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_restrictions
    ADD CONSTRAINT enrollment_restrictions_pkey PRIMARY KEY (id);


--
-- Name: enrollment_statistics enrollment_statistics_class_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_statistics
    ADD CONSTRAINT enrollment_statistics_class_id_key UNIQUE (class_id);


--
-- Name: enrollment_statistics enrollment_statistics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_statistics
    ADD CONSTRAINT enrollment_statistics_pkey PRIMARY KEY (id);


--
-- Name: enrollments enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_pkey PRIMARY KEY (id);


--
-- Name: enrollments enrollments_unique_student_class; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_unique_student_class UNIQUE (class_id, student_id);


--
-- Name: import_errors import_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_errors
    ADD CONSTRAINT import_errors_pkey PRIMARY KEY (id);


--
-- Name: import_notifications import_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_notifications
    ADD CONSTRAINT import_notifications_pkey PRIMARY KEY (id);


--
-- Name: import_progress import_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_progress
    ADD CONSTRAINT import_progress_pkey PRIMARY KEY (id);


--
-- Name: import_warnings import_warnings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_warnings
    ADD CONSTRAINT import_warnings_pkey PRIMARY KEY (id);


--
-- Name: institution_domains institution_domains_institution_id_domain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_domains
    ADD CONSTRAINT institution_domains_institution_id_domain_key UNIQUE (institution_id, domain);


--
-- Name: institution_domains institution_domains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_domains
    ADD CONSTRAINT institution_domains_pkey PRIMARY KEY (id);


--
-- Name: institutional_role_policies institutional_role_policies_institution_id_policy_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutional_role_policies
    ADD CONSTRAINT institutional_role_policies_institution_id_policy_name_key UNIQUE (institution_id, policy_name);


--
-- Name: institutional_role_policies institutional_role_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutional_role_policies
    ADD CONSTRAINT institutional_role_policies_pkey PRIMARY KEY (id);


--
-- Name: institutions institutions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT institutions_pkey PRIMARY KEY (id);


--
-- Name: invitation_audit_log invitation_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_audit_log
    ADD CONSTRAINT invitation_audit_log_pkey PRIMARY KEY (id);


--
-- Name: migration_snapshots migration_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_snapshots
    ADD CONSTRAINT migration_snapshots_pkey PRIMARY KEY (id);


--
-- Name: notification_delivery_log notification_delivery_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery_log
    ADD CONSTRAINT notification_delivery_log_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_key UNIQUE (user_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: onboarding_sessions onboarding_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_sessions
    ADD CONSTRAINT onboarding_sessions_pkey PRIMARY KEY (id);


--
-- Name: onboarding_sessions onboarding_sessions_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_sessions
    ADD CONSTRAINT onboarding_sessions_user_id_key UNIQUE (user_id);


--
-- Name: peer_review_activity peer_review_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_review_activity
    ADD CONSTRAINT peer_review_activity_pkey PRIMARY KEY (id);


--
-- Name: peer_review_assignments peer_review_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_review_assignments
    ADD CONSTRAINT peer_review_assignments_pkey PRIMARY KEY (id);


--
-- Name: peer_reviews peer_reviews_peer_review_assignment_id_reviewer_id_reviewee_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_reviews
    ADD CONSTRAINT peer_reviews_peer_review_assignment_id_reviewer_id_reviewee_key UNIQUE (peer_review_assignment_id, reviewer_id, reviewee_id);


--
-- Name: peer_reviews peer_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_reviews
    ADD CONSTRAINT peer_reviews_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_name_key UNIQUE (name);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: role_assignment_audit role_assignment_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_assignment_audit
    ADD CONSTRAINT role_assignment_audit_pkey PRIMARY KEY (id);


--
-- Name: role_assignment_conflicts role_assignment_conflicts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_assignment_conflicts
    ADD CONSTRAINT role_assignment_conflicts_pkey PRIMARY KEY (id);


--
-- Name: role_assignment_notifications role_assignment_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_assignment_notifications
    ADD CONSTRAINT role_assignment_notifications_pkey PRIMARY KEY (id);


--
-- Name: role_audit_log role_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_audit_log
    ADD CONSTRAINT role_audit_log_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_role_permission_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_permission_id_key UNIQUE (role, permission_id);


--
-- Name: role_requests role_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_requests
    ADD CONSTRAINT role_requests_pkey PRIMARY KEY (id);


--
-- Name: rubric_assignments rubric_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubric_assignments
    ADD CONSTRAINT rubric_assignments_pkey PRIMARY KEY (id);


--
-- Name: rubric_assignments rubric_assignments_rubric_id_assignment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubric_assignments
    ADD CONSTRAINT rubric_assignments_rubric_id_assignment_id_key UNIQUE (rubric_id, assignment_id);


--
-- Name: rubric_criteria rubric_criteria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubric_criteria
    ADD CONSTRAINT rubric_criteria_pkey PRIMARY KEY (id);


--
-- Name: rubric_levels rubric_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubric_levels
    ADD CONSTRAINT rubric_levels_pkey PRIMARY KEY (id);


--
-- Name: rubric_quality_indicators rubric_quality_indicators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubric_quality_indicators
    ADD CONSTRAINT rubric_quality_indicators_pkey PRIMARY KEY (id);


--
-- Name: rubric_templates rubric_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubric_templates
    ADD CONSTRAINT rubric_templates_pkey PRIMARY KEY (id);


--
-- Name: rubrics rubrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubrics
    ADD CONSTRAINT rubrics_pkey PRIMARY KEY (id);


--
-- Name: submissions submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_pkey PRIMARY KEY (id);


--
-- Name: submissions submissions_unique_student_assignment; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_unique_student_assignment UNIQUE (assignment_id, student_id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: user_role_assignments user_role_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_role_assignments
    ADD CONSTRAINT user_role_assignments_pkey PRIMARY KEY (id);


--
-- Name: user_role_assignments user_role_assignments_user_id_role_department_id_institutio_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_role_assignments
    ADD CONSTRAINT user_role_assignments_user_id_role_department_id_institutio_key UNIQUE (user_id, role, department_id, institution_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: waitlist_entries waitlist_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist_entries
    ADD CONSTRAINT waitlist_entries_pkey PRIMARY KEY (id);


--
-- Name: waitlist_entries waitlist_entries_student_id_class_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist_entries
    ADD CONSTRAINT waitlist_entries_student_id_class_id_key UNIQUE (student_id, class_id);


--
-- Name: waitlist_notifications waitlist_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist_notifications
    ADD CONSTRAINT waitlist_notifications_pkey PRIMARY KEY (id);


--
-- Name: idx_assignments_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_class_id ON public.assignments USING btree (class_id);


--
-- Name: idx_assignments_teacher_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_teacher_id ON public.assignments USING btree (teacher_id);


--
-- Name: idx_bulk_imports_initiated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_imports_initiated_by ON public.bulk_imports USING btree (initiated_by, started_at DESC);


--
-- Name: idx_bulk_imports_status_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_imports_status_institution ON public.bulk_imports USING btree (status, institution_id, started_at);


--
-- Name: idx_bulk_role_assignment_items_bulk_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_role_assignment_items_bulk_id ON public.bulk_role_assignment_items USING btree (bulk_assignment_id);


--
-- Name: idx_bulk_role_assignment_items_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_role_assignment_items_status ON public.bulk_role_assignment_items USING btree (assignment_status);


--
-- Name: idx_bulk_role_assignment_items_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_role_assignment_items_user ON public.bulk_role_assignment_items USING btree (user_id);


--
-- Name: idx_bulk_role_assignments_initiated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_role_assignments_initiated_by ON public.bulk_role_assignments USING btree (initiated_by);


--
-- Name: idx_bulk_role_assignments_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_role_assignments_institution ON public.bulk_role_assignments USING btree (institution_id);


--
-- Name: idx_bulk_role_assignments_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_role_assignments_started_at ON public.bulk_role_assignments USING btree (started_at DESC);


--
-- Name: idx_bulk_role_assignments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_role_assignments_status ON public.bulk_role_assignments USING btree (status);


--
-- Name: idx_class_invitations_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_invitations_class_id ON public.class_invitations USING btree (class_id);


--
-- Name: idx_class_invitations_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_invitations_email ON public.class_invitations USING btree (email);


--
-- Name: idx_class_invitations_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_invitations_expires_at ON public.class_invitations USING btree (expires_at);


--
-- Name: idx_class_invitations_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_invitations_student_id ON public.class_invitations USING btree (student_id);


--
-- Name: idx_class_invitations_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_invitations_token ON public.class_invitations USING btree (token);


--
-- Name: idx_class_prerequisites_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_prerequisites_class_id ON public.class_prerequisites USING btree (class_id);


--
-- Name: idx_classes_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classes_code ON public.classes USING btree (code);


--
-- Name: idx_classes_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classes_institution_id ON public.classes USING btree (institution_id);


--
-- Name: idx_classes_teacher_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classes_teacher_id ON public.classes USING btree (teacher_id);


--
-- Name: idx_delivery_log_method; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_log_method ON public.notification_delivery_log USING btree (delivery_method);


--
-- Name: idx_delivery_log_notification_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_log_notification_id ON public.notification_delivery_log USING btree (notification_id);


--
-- Name: idx_delivery_log_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_log_status ON public.notification_delivery_log USING btree (delivery_status);


--
-- Name: idx_enrollment_audit_log_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrollment_audit_log_class_id ON public.enrollment_audit_log USING btree (class_id);


--
-- Name: idx_enrollment_audit_log_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrollment_audit_log_student_id ON public.enrollment_audit_log USING btree (student_id);


--
-- Name: idx_enrollment_audit_log_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrollment_audit_log_timestamp ON public.enrollment_audit_log USING btree ("timestamp" DESC);


--
-- Name: idx_enrollment_requests_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrollment_requests_class_id ON public.enrollment_requests USING btree (class_id);


--
-- Name: idx_enrollment_requests_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrollment_requests_expires_at ON public.enrollment_requests USING btree (expires_at);


--
-- Name: idx_enrollment_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrollment_requests_status ON public.enrollment_requests USING btree (status);


--
-- Name: idx_enrollment_requests_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrollment_requests_student_id ON public.enrollment_requests USING btree (student_id);


--
-- Name: idx_enrollment_restrictions_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrollment_restrictions_class_id ON public.enrollment_restrictions USING btree (class_id);


--
-- Name: idx_enrollments_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrollments_class_id ON public.enrollments USING btree (class_id);


--
-- Name: idx_enrollments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrollments_status ON public.enrollments USING btree (status);


--
-- Name: idx_enrollments_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrollments_student_id ON public.enrollments USING btree (student_id);


--
-- Name: idx_import_errors_import_row; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_errors_import_row ON public.import_errors USING btree (import_id, row_number);


--
-- Name: idx_import_notifications_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_notifications_recipient ON public.import_notifications USING btree (recipient_id, created_at DESC);


--
-- Name: idx_import_progress_import; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_progress_import ON public.import_progress USING btree (import_id, updated_at DESC);


--
-- Name: idx_import_warnings_import_row; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_warnings_import_row ON public.import_warnings USING btree (import_id, row_number);


--
-- Name: idx_institution_domains_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_institution_domains_domain ON public.institution_domains USING btree (domain);


--
-- Name: idx_institution_domains_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_institution_domains_institution_id ON public.institution_domains USING btree (institution_id);


--
-- Name: idx_institution_domains_verified; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_institution_domains_verified ON public.institution_domains USING btree (verified);


--
-- Name: idx_institutional_role_policies_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_institutional_role_policies_active ON public.institutional_role_policies USING btree (is_active);


--
-- Name: idx_institutional_role_policies_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_institutional_role_policies_institution ON public.institutional_role_policies USING btree (institution_id);


--
-- Name: idx_institutional_role_policies_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_institutional_role_policies_type ON public.institutional_role_policies USING btree (policy_type);


--
-- Name: idx_invitation_audit_log_invitation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitation_audit_log_invitation_id ON public.invitation_audit_log USING btree (invitation_id);


--
-- Name: idx_invitation_audit_log_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitation_audit_log_timestamp ON public.invitation_audit_log USING btree ("timestamp" DESC);


--
-- Name: idx_migration_snapshots_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_migration_snapshots_institution ON public.migration_snapshots USING btree (institution_id, created_at DESC);


--
-- Name: idx_notification_preferences_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_preferences_user_id ON public.notification_preferences USING btree (user_id);


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);


--
-- Name: idx_notifications_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_priority ON public.notifications USING btree (priority);


--
-- Name: idx_notifications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_type ON public.notifications USING btree (type);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_onboarding_sessions_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_onboarding_sessions_completed ON public.onboarding_sessions USING btree (completed_at);


--
-- Name: idx_onboarding_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_onboarding_sessions_user ON public.onboarding_sessions USING btree (user_id);


--
-- Name: idx_onboarding_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_onboarding_sessions_user_id ON public.onboarding_sessions USING btree (user_id);


--
-- Name: idx_peer_review_activity_assignment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_peer_review_activity_assignment_id ON public.peer_review_activity USING btree (peer_review_assignment_id);


--
-- Name: idx_peer_review_assignments_assignment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_peer_review_assignments_assignment_id ON public.peer_review_assignments USING btree (assignment_id);


--
-- Name: idx_peer_review_assignments_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_peer_review_assignments_class_id ON public.peer_review_assignments USING btree (class_id);


--
-- Name: idx_peer_review_assignments_teacher_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_peer_review_assignments_teacher_id ON public.peer_review_assignments USING btree (teacher_id);


--
-- Name: idx_peer_reviews_assignment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_peer_reviews_assignment_id ON public.peer_reviews USING btree (peer_review_assignment_id);


--
-- Name: idx_peer_reviews_reviewee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_peer_reviews_reviewee_id ON public.peer_reviews USING btree (reviewee_id);


--
-- Name: idx_peer_reviews_reviewer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_peer_reviews_reviewer_id ON public.peer_reviews USING btree (reviewer_id);


--
-- Name: idx_permissions_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permissions_category ON public.permissions USING btree (category);


--
-- Name: idx_permissions_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permissions_name ON public.permissions USING btree (name);


--
-- Name: idx_permissions_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permissions_scope ON public.permissions USING btree (scope);


--
-- Name: idx_role_assignment_audit_bulk_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_assignment_audit_bulk_id ON public.role_assignment_audit USING btree (bulk_assignment_id);


--
-- Name: idx_role_assignment_audit_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_assignment_audit_created_at ON public.role_assignment_audit USING btree (created_at DESC);


--
-- Name: idx_role_assignment_audit_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_assignment_audit_institution ON public.role_assignment_audit USING btree (institution_id);


--
-- Name: idx_role_assignment_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_assignment_audit_user ON public.role_assignment_audit USING btree (user_id);


--
-- Name: idx_role_assignment_conflicts_bulk_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_assignment_conflicts_bulk_id ON public.role_assignment_conflicts USING btree (bulk_assignment_id);


--
-- Name: idx_role_assignment_conflicts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_assignment_conflicts_status ON public.role_assignment_conflicts USING btree (resolution_status);


--
-- Name: idx_role_assignment_conflicts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_assignment_conflicts_user ON public.role_assignment_conflicts USING btree (user_id);


--
-- Name: idx_role_assignment_notifications_bulk_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_assignment_notifications_bulk_id ON public.role_assignment_notifications USING btree (bulk_assignment_id);


--
-- Name: idx_role_assignment_notifications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_assignment_notifications_status ON public.role_assignment_notifications USING btree (delivery_status);


--
-- Name: idx_role_assignment_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_assignment_notifications_user ON public.role_assignment_notifications USING btree (user_id);


--
-- Name: idx_role_audit_log_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_audit_log_action ON public.role_audit_log USING btree (action);


--
-- Name: idx_role_audit_log_changed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_audit_log_changed_by ON public.role_audit_log USING btree (changed_by);


--
-- Name: idx_role_audit_log_department_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_audit_log_department_id ON public.role_audit_log USING btree (department_id);


--
-- Name: idx_role_audit_log_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_audit_log_institution_id ON public.role_audit_log USING btree (institution_id);


--
-- Name: idx_role_audit_log_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_audit_log_timestamp ON public.role_audit_log USING btree ("timestamp");


--
-- Name: idx_role_audit_log_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_audit_log_user_id ON public.role_audit_log USING btree (user_id);


--
-- Name: idx_role_audit_log_user_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_audit_log_user_timestamp ON public.role_audit_log USING btree (user_id, "timestamp" DESC);


--
-- Name: idx_role_permissions_permission_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_permissions_permission_id ON public.role_permissions USING btree (permission_id);


--
-- Name: idx_role_permissions_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_permissions_role ON public.role_permissions USING btree (role);


--
-- Name: idx_role_requests_department_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_requests_department_id ON public.role_requests USING btree (department_id);


--
-- Name: idx_role_requests_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_requests_expires_at ON public.role_requests USING btree (expires_at);


--
-- Name: idx_role_requests_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_requests_institution_id ON public.role_requests USING btree (institution_id);


--
-- Name: idx_role_requests_institution_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_requests_institution_pending ON public.role_requests USING btree (institution_id, requested_at DESC) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_role_requests_institution_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_requests_institution_status ON public.role_requests USING btree (institution_id, status, requested_at);


--
-- Name: idx_role_requests_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_requests_pending ON public.role_requests USING btree (status, requested_at) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_role_requests_requested_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_requests_requested_role ON public.role_requests USING btree (requested_role);


--
-- Name: idx_role_requests_reviewed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_requests_reviewed_by ON public.role_requests USING btree (reviewed_by);


--
-- Name: idx_role_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_requests_status ON public.role_requests USING btree (status);


--
-- Name: idx_role_requests_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_requests_user_id ON public.role_requests USING btree (user_id);


--
-- Name: idx_rubric_assignments_assignment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rubric_assignments_assignment_id ON public.rubric_assignments USING btree (assignment_id);


--
-- Name: idx_rubric_assignments_rubric_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rubric_assignments_rubric_id ON public.rubric_assignments USING btree (rubric_id);


--
-- Name: idx_rubric_criteria_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rubric_criteria_order ON public.rubric_criteria USING btree (rubric_id, order_index);


--
-- Name: idx_rubric_criteria_rubric_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rubric_criteria_rubric_id ON public.rubric_criteria USING btree (rubric_id);


--
-- Name: idx_rubric_levels_criterion_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rubric_levels_criterion_id ON public.rubric_levels USING btree (criterion_id);


--
-- Name: idx_rubric_levels_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rubric_levels_order ON public.rubric_levels USING btree (criterion_id, order_index);


--
-- Name: idx_rubric_quality_indicators_level_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rubric_quality_indicators_level_id ON public.rubric_quality_indicators USING btree (level_id);


--
-- Name: idx_rubrics_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rubrics_class_id ON public.rubrics USING btree (class_id);


--
-- Name: idx_rubrics_teacher_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rubrics_teacher_id ON public.rubrics USING btree (teacher_id);


--
-- Name: idx_submissions_assignment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_submissions_assignment_id ON public.submissions USING btree (assignment_id);


--
-- Name: idx_submissions_rubric_scores; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_submissions_rubric_scores ON public.submissions USING gin (rubric_scores);


--
-- Name: idx_submissions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_submissions_status ON public.submissions USING btree (status);


--
-- Name: idx_submissions_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_submissions_student_id ON public.submissions USING btree (student_id);


--
-- Name: idx_submissions_submitted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_submissions_submitted_at ON public.submissions USING btree (submitted_at);


--
-- Name: idx_user_profiles_department_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_department_id ON public.user_profiles USING btree (department_id);


--
-- Name: idx_user_profiles_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_institution_id ON public.user_profiles USING btree (institution_id);


--
-- Name: idx_user_profiles_onboarding_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_onboarding_completed ON public.user_profiles USING btree (onboarding_completed);


--
-- Name: idx_user_role_assignments_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_role_assignments_active ON public.user_role_assignments USING btree (user_id, status) WHERE ((status)::text = 'active'::text);


--
-- Name: idx_user_role_assignments_assigned_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_role_assignments_assigned_by ON public.user_role_assignments USING btree (assigned_by);


--
-- Name: idx_user_role_assignments_department_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_role_assignments_department_id ON public.user_role_assignments USING btree (department_id);


--
-- Name: idx_user_role_assignments_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_role_assignments_expires_at ON public.user_role_assignments USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_user_role_assignments_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_role_assignments_institution_id ON public.user_role_assignments USING btree (institution_id);


--
-- Name: idx_user_role_assignments_is_temporary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_role_assignments_is_temporary ON public.user_role_assignments USING btree (is_temporary);


--
-- Name: idx_user_role_assignments_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_role_assignments_role ON public.user_role_assignments USING btree (role);


--
-- Name: idx_user_role_assignments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_role_assignments_status ON public.user_role_assignments USING btree (status);


--
-- Name: idx_user_role_assignments_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_role_assignments_user_id ON public.user_role_assignments USING btree (user_id);


--
-- Name: idx_user_role_assignments_user_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_role_assignments_user_institution ON public.user_role_assignments USING btree (user_id, institution_id, status);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_institution_id ON public.users USING btree (institution_id);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_waitlist_entries_class_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_entries_class_id ON public.waitlist_entries USING btree (class_id);


--
-- Name: idx_waitlist_entries_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_entries_position ON public.waitlist_entries USING btree (class_id, "position");


--
-- Name: idx_waitlist_entries_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_entries_priority ON public.waitlist_entries USING btree (class_id, priority DESC, added_at);


--
-- Name: idx_waitlist_entries_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_entries_student_id ON public.waitlist_entries USING btree (student_id);


--
-- Name: idx_waitlist_notifications_entry_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_notifications_entry_id ON public.waitlist_notifications USING btree (waitlist_entry_id);


--
-- Name: idx_waitlist_notifications_response_deadline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_notifications_response_deadline ON public.waitlist_notifications USING btree (response_deadline);


--
-- Name: users create_user_notification_preferences; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER create_user_notification_preferences AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.create_default_notification_preferences();


--
-- Name: submissions guard_submission_grading; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_submission_grading BEFORE INSERT OR UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION app_private.guard_submission_grading();


--
-- Name: users guard_users_privileged_columns; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_users_privileged_columns BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION app_private.guard_users_privileged_columns();


--
-- Name: enrollment_requests request_stats_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER request_stats_trigger AFTER INSERT OR DELETE OR UPDATE ON public.enrollment_requests FOR EACH ROW EXECUTE FUNCTION public.update_enrollment_statistics();


--
-- Name: enrollments trigger_enrollment_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_enrollment_count AFTER INSERT OR DELETE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.update_enrollment_count();


--
-- Name: user_role_assignments trigger_log_role_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_log_role_change AFTER INSERT OR DELETE OR UPDATE ON public.user_role_assignments FOR EACH ROW EXECUTE FUNCTION public.log_role_change();


--
-- Name: bulk_imports update_bulk_imports_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bulk_imports_updated_at BEFORE UPDATE ON public.bulk_imports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bulk_role_assignments update_bulk_role_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bulk_role_assignments_updated_at BEFORE UPDATE ON public.bulk_role_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: import_progress update_import_progress_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_import_progress_updated_at BEFORE UPDATE ON public.import_progress FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: institutional_role_policies update_institutional_role_policies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_institutional_role_policies_updated_at BEFORE UPDATE ON public.institutional_role_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: notification_preferences update_notification_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: rubric_criteria update_rubric_points_on_criteria_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_rubric_points_on_criteria_change AFTER INSERT OR DELETE OR UPDATE ON public.rubric_criteria FOR EACH ROW EXECUTE FUNCTION public.update_rubric_total_points();


--
-- Name: rubric_levels update_rubric_points_on_level_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_rubric_points_on_level_change AFTER INSERT OR DELETE OR UPDATE ON public.rubric_levels FOR EACH ROW EXECUTE FUNCTION public.update_rubric_total_points();


--
-- Name: rubrics update_rubrics_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_rubrics_updated_at BEFORE UPDATE ON public.rubrics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: waitlist_entries waitlist_position_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER waitlist_position_trigger AFTER INSERT OR DELETE ON public.waitlist_entries FOR EACH ROW EXECUTE FUNCTION public.update_waitlist_positions();


--
-- Name: waitlist_entries waitlist_stats_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER waitlist_stats_trigger AFTER INSERT OR DELETE OR UPDATE ON public.waitlist_entries FOR EACH ROW EXECUTE FUNCTION public.update_enrollment_statistics();


--
-- Name: assignments assignments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: assignments assignments_rubric_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_rubric_id_fkey FOREIGN KEY (rubric_id) REFERENCES public.rubrics(id);


--
-- Name: assignments assignments_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: bulk_imports bulk_imports_initiated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_imports
    ADD CONSTRAINT bulk_imports_initiated_by_fkey FOREIGN KEY (initiated_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: bulk_imports bulk_imports_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_imports
    ADD CONSTRAINT bulk_imports_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: bulk_role_assignment_items bulk_role_assignment_items_bulk_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_role_assignment_items
    ADD CONSTRAINT bulk_role_assignment_items_bulk_assignment_id_fkey FOREIGN KEY (bulk_assignment_id) REFERENCES public.bulk_role_assignments(id) ON DELETE CASCADE;


--
-- Name: bulk_role_assignment_items bulk_role_assignment_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_role_assignment_items
    ADD CONSTRAINT bulk_role_assignment_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: bulk_role_assignments bulk_role_assignments_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_role_assignments
    ADD CONSTRAINT bulk_role_assignments_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: bulk_role_assignments bulk_role_assignments_initiated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_role_assignments
    ADD CONSTRAINT bulk_role_assignments_initiated_by_fkey FOREIGN KEY (initiated_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: bulk_role_assignments bulk_role_assignments_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_role_assignments
    ADD CONSTRAINT bulk_role_assignments_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: class_invitations class_invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_invitations
    ADD CONSTRAINT class_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.user_profiles(id);


--
-- Name: class_invitations class_invitations_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_invitations
    ADD CONSTRAINT class_invitations_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.user_profiles(id);


--
-- Name: classes classes_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: classes classes_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: classes classes_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: departments departments_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: enrollment_audit_log enrollment_audit_log_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_audit_log
    ADD CONSTRAINT enrollment_audit_log_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.user_profiles(id);


--
-- Name: enrollment_audit_log enrollment_audit_log_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_audit_log
    ADD CONSTRAINT enrollment_audit_log_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.user_profiles(id);


--
-- Name: enrollment_requests enrollment_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_requests
    ADD CONSTRAINT enrollment_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.user_profiles(id);


--
-- Name: enrollment_requests enrollment_requests_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_requests
    ADD CONSTRAINT enrollment_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.user_profiles(id);


--
-- Name: enrollments enrollments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: enrollments enrollments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: institution_domains fk_institution_domains_verified_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_domains
    ADD CONSTRAINT fk_institution_domains_verified_by FOREIGN KEY (verified_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;


--
-- Name: role_audit_log fk_role_audit_log_changed_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_audit_log
    ADD CONSTRAINT fk_role_audit_log_changed_by FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: role_audit_log fk_role_audit_log_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_audit_log
    ADD CONSTRAINT fk_role_audit_log_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: role_permissions fk_role_permissions_permission; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_requests fk_role_requests_reviewed_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_requests
    ADD CONSTRAINT fk_role_requests_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: role_requests fk_role_requests_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_requests
    ADD CONSTRAINT fk_role_requests_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_role_assignments fk_user_role_assignments_assigned_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_role_assignments
    ADD CONSTRAINT fk_user_role_assignments_assigned_by FOREIGN KEY (assigned_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;


--
-- Name: user_role_assignments fk_user_role_assignments_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_role_assignments
    ADD CONSTRAINT fk_user_role_assignments_user FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
-- Name: import_errors import_errors_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_errors
    ADD CONSTRAINT import_errors_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.bulk_imports(id) ON DELETE CASCADE;


--
-- Name: import_notifications import_notifications_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_notifications
    ADD CONSTRAINT import_notifications_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.bulk_imports(id) ON DELETE CASCADE;


--
-- Name: import_notifications import_notifications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_notifications
    ADD CONSTRAINT import_notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: import_progress import_progress_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_progress
    ADD CONSTRAINT import_progress_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.bulk_imports(id) ON DELETE CASCADE;


--
-- Name: import_warnings import_warnings_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_warnings
    ADD CONSTRAINT import_warnings_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.bulk_imports(id) ON DELETE CASCADE;


--
-- Name: institutional_role_policies institutional_role_policies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutional_role_policies
    ADD CONSTRAINT institutional_role_policies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: institutional_role_policies institutional_role_policies_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutional_role_policies
    ADD CONSTRAINT institutional_role_policies_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: institutional_role_policies institutional_role_policies_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutional_role_policies
    ADD CONSTRAINT institutional_role_policies_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: institutions institutions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT institutions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invitation_audit_log invitation_audit_log_invitation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_audit_log
    ADD CONSTRAINT invitation_audit_log_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES public.class_invitations(id);


--
-- Name: invitation_audit_log invitation_audit_log_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_audit_log
    ADD CONSTRAINT invitation_audit_log_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.user_profiles(id);


--
-- Name: migration_snapshots migration_snapshots_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_snapshots
    ADD CONSTRAINT migration_snapshots_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.bulk_imports(id) ON DELETE CASCADE;


--
-- Name: migration_snapshots migration_snapshots_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_snapshots
    ADD CONSTRAINT migration_snapshots_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: notification_delivery_log notification_delivery_log_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery_log
    ADD CONSTRAINT notification_delivery_log_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: onboarding_sessions onboarding_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_sessions
    ADD CONSTRAINT onboarding_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
-- Name: peer_review_activity peer_review_activity_peer_review_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_review_activity
    ADD CONSTRAINT peer_review_activity_peer_review_assignment_id_fkey FOREIGN KEY (peer_review_assignment_id) REFERENCES public.peer_review_assignments(id) ON DELETE CASCADE;


--
-- Name: peer_review_activity peer_review_activity_peer_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_review_activity
    ADD CONSTRAINT peer_review_activity_peer_review_id_fkey FOREIGN KEY (peer_review_id) REFERENCES public.peer_reviews(id) ON DELETE CASCADE;


--
-- Name: peer_review_activity peer_review_activity_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_review_activity
    ADD CONSTRAINT peer_review_activity_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: peer_review_assignments peer_review_assignments_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_review_assignments
    ADD CONSTRAINT peer_review_assignments_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE;


--
-- Name: peer_review_assignments peer_review_assignments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_review_assignments
    ADD CONSTRAINT peer_review_assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: peer_review_assignments peer_review_assignments_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_review_assignments
    ADD CONSTRAINT peer_review_assignments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: peer_reviews peer_reviews_peer_review_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_reviews
    ADD CONSTRAINT peer_reviews_peer_review_assignment_id_fkey FOREIGN KEY (peer_review_assignment_id) REFERENCES public.peer_review_assignments(id) ON DELETE CASCADE;


--
-- Name: peer_reviews peer_reviews_reviewee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_reviews
    ADD CONSTRAINT peer_reviews_reviewee_id_fkey FOREIGN KEY (reviewee_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: peer_reviews peer_reviews_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_reviews
    ADD CONSTRAINT peer_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: role_assignment_audit role_assignment_audit_bulk_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_assignment_audit
    ADD CONSTRAINT role_assignment_audit_bulk_assignment_id_fkey FOREIGN KEY (bulk_assignment_id) REFERENCES public.bulk_role_assignments(id);


--
-- Name: role_assignment_audit role_assignment_audit_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_assignment_audit
    ADD CONSTRAINT role_assignment_audit_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id);


--
-- Name: role_assignment_audit role_assignment_audit_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_assignment_audit
    ADD CONSTRAINT role_assignment_audit_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: role_assignment_audit role_assignment_audit_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_assignment_audit
    ADD CONSTRAINT role_assignment_audit_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: role_assignment_conflicts role_assignment_conflicts_bulk_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_assignment_conflicts
    ADD CONSTRAINT role_assignment_conflicts_bulk_assignment_id_fkey FOREIGN KEY (bulk_assignment_id) REFERENCES public.bulk_role_assignments(id) ON DELETE CASCADE;


--
-- Name: role_assignment_conflicts role_assignment_conflicts_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_assignment_conflicts
    ADD CONSTRAINT role_assignment_conflicts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id);


--
-- Name: role_assignment_conflicts role_assignment_conflicts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_assignment_conflicts
    ADD CONSTRAINT role_assignment_conflicts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: role_assignment_notifications role_assignment_notifications_bulk_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_assignment_notifications
    ADD CONSTRAINT role_assignment_notifications_bulk_assignment_id_fkey FOREIGN KEY (bulk_assignment_id) REFERENCES public.bulk_role_assignments(id) ON DELETE CASCADE;


--
-- Name: role_assignment_notifications role_assignment_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_assignment_notifications
    ADD CONSTRAINT role_assignment_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: rubric_assignments rubric_assignments_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubric_assignments
    ADD CONSTRAINT rubric_assignments_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE;


--
-- Name: rubric_assignments rubric_assignments_rubric_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubric_assignments
    ADD CONSTRAINT rubric_assignments_rubric_id_fkey FOREIGN KEY (rubric_id) REFERENCES public.rubrics(id) ON DELETE CASCADE;


--
-- Name: rubric_criteria rubric_criteria_rubric_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubric_criteria
    ADD CONSTRAINT rubric_criteria_rubric_id_fkey FOREIGN KEY (rubric_id) REFERENCES public.rubrics(id) ON DELETE CASCADE;


--
-- Name: rubric_levels rubric_levels_criterion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubric_levels
    ADD CONSTRAINT rubric_levels_criterion_id_fkey FOREIGN KEY (criterion_id) REFERENCES public.rubric_criteria(id) ON DELETE CASCADE;


--
-- Name: rubric_quality_indicators rubric_quality_indicators_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubric_quality_indicators
    ADD CONSTRAINT rubric_quality_indicators_level_id_fkey FOREIGN KEY (level_id) REFERENCES public.rubric_levels(id) ON DELETE CASCADE;


--
-- Name: rubric_templates rubric_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubric_templates
    ADD CONSTRAINT rubric_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: rubrics rubrics_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubrics
    ADD CONSTRAINT rubrics_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;


--
-- Name: rubrics rubrics_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubrics
    ADD CONSTRAINT rubrics_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: submissions submissions_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE;


--
-- Name: submissions submissions_graded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_graded_by_fkey FOREIGN KEY (graded_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: submissions submissions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_profiles user_profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: users users_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: users users_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: waitlist_entries waitlist_entries_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist_entries
    ADD CONSTRAINT waitlist_entries_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.user_profiles(id);


--
-- Name: waitlist_notifications waitlist_notifications_waitlist_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist_notifications
    ADD CONSTRAINT waitlist_notifications_waitlist_entry_id_fkey FOREIGN KEY (waitlist_entry_id) REFERENCES public.waitlist_entries(id);


--
-- Name: user_role_assignments Admins can view all role assignments in their institution; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all role assignments in their institution" ON public.user_role_assignments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.user_profiles up
     JOIN public.user_role_assignments ura ON ((up.id = ura.user_id)))
  WHERE ((up.id = auth.uid()) AND ((ura.role)::text = ANY ((ARRAY['institution_admin'::character varying, 'system_admin'::character varying])::text[])) AND (ura.institution_id = user_role_assignments.institution_id) AND ((ura.status)::text = 'active'::text)))));


--
-- Name: notification_delivery_log Admins can view delivery logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view delivery logs" ON public.notification_delivery_log FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['institution_admin'::text, 'department_admin'::text]))))));


--
-- Name: permissions Anyone can view permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view permissions" ON public.permissions FOR SELECT USING (true);


--
-- Name: rubric_templates Anyone can view public templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view public templates" ON public.rubric_templates FOR SELECT USING (((is_public = true) OR (created_by = auth.uid())));


--
-- Name: role_permissions Anyone can view role permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view role permissions" ON public.role_permissions FOR SELECT USING (true);


--
-- Name: rubric_templates Authenticated users can create templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create templates" ON public.rubric_templates FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: bulk_imports Institution admins can manage bulk imports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Institution admins can manage bulk imports" ON public.bulk_imports USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.institution_id = bulk_imports.institution_id) AND (users.role = ANY (ARRAY['institution_admin'::text, 'department_admin'::text]))))));


--
-- Name: bulk_role_assignments Institution admins can manage bulk role assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Institution admins can manage bulk role assignments" ON public.bulk_role_assignments USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.institution_id = bulk_role_assignments.institution_id) AND (users.role = ANY (ARRAY['institution_admin'::text, 'department_admin'::text]))))));


--
-- Name: role_assignment_conflicts Institution admins can manage conflicts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Institution admins can manage conflicts" ON public.role_assignment_conflicts USING ((EXISTS ( SELECT 1
   FROM (public.bulk_role_assignments bra
     JOIN public.users u ON ((u.id = auth.uid())))
  WHERE ((bra.id = role_assignment_conflicts.bulk_assignment_id) AND (u.institution_id = bra.institution_id) AND (u.role = ANY (ARRAY['institution_admin'::text, 'department_admin'::text]))))));


--
-- Name: role_assignment_notifications Institution admins can manage notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Institution admins can manage notifications" ON public.role_assignment_notifications USING ((EXISTS ( SELECT 1
   FROM (public.bulk_role_assignments bra
     JOIN public.users u ON ((u.id = auth.uid())))
  WHERE ((bra.id = role_assignment_notifications.bulk_assignment_id) AND (u.institution_id = bra.institution_id) AND (u.role = ANY (ARRAY['institution_admin'::text, 'department_admin'::text]))))));


--
-- Name: institutional_role_policies Institution admins can manage role policies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Institution admins can manage role policies" ON public.institutional_role_policies USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.institution_id = institutional_role_policies.institution_id) AND (users.role = 'institution_admin'::text)))));


--
-- Name: migration_snapshots Institution admins can manage snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Institution admins can manage snapshots" ON public.migration_snapshots USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.institution_id = migration_snapshots.institution_id) AND (users.role = ANY (ARRAY['institution_admin'::text, 'department_admin'::text]))))));


--
-- Name: role_assignment_audit Institution admins can view audit trail; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Institution admins can view audit trail" ON public.role_assignment_audit FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.institution_id = role_assignment_audit.institution_id) AND (users.role = ANY (ARRAY['institution_admin'::text, 'department_admin'::text]))))));


--
-- Name: bulk_role_assignment_items Institution admins can view bulk assignment items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Institution admins can view bulk assignment items" ON public.bulk_role_assignment_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.bulk_role_assignments bra
     JOIN public.users u ON ((u.id = auth.uid())))
  WHERE ((bra.id = bulk_role_assignment_items.bulk_assignment_id) AND (u.institution_id = bra.institution_id) AND (u.role = ANY (ARRAY['institution_admin'::text, 'department_admin'::text]))))));


--
-- Name: rubric_assignments Teachers can manage rubric assignments for their assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can manage rubric assignments for their assignments" ON public.rubric_assignments USING ((EXISTS ( SELECT 1
   FROM public.assignments a
  WHERE ((a.id = rubric_assignments.assignment_id) AND (a.teacher_id = auth.uid())))));


--
-- Name: onboarding_sessions Users can insert own onboarding session; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own onboarding session" ON public.onboarding_sessions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.user_profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: onboarding_sessions Users can manage own onboarding; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own onboarding" ON public.onboarding_sessions USING ((auth.uid() = user_id));


--
-- Name: notification_preferences Users can manage their own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own preferences" ON public.notification_preferences USING ((user_id = auth.uid()));


--
-- Name: onboarding_sessions Users can update own onboarding session; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own onboarding session" ON public.onboarding_sessions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: user_profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.user_profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: rubric_templates Users can update their own templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own templates" ON public.rubric_templates FOR UPDATE USING ((created_by = auth.uid()));


--
-- Name: import_errors Users can view errors for their institution's imports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view errors for their institution's imports" ON public.import_errors FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.bulk_imports bi
     JOIN public.users u ON ((u.id = auth.uid())))
  WHERE ((bi.id = import_errors.import_id) AND (u.institution_id = bi.institution_id)))));


--
-- Name: onboarding_sessions Users can view own onboarding session; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own onboarding session" ON public.onboarding_sessions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.user_profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: user_role_assignments Users can view own role assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own role assignments" ON public.user_role_assignments FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: import_progress Users can view progress for their institution's imports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view progress for their institution's imports" ON public.import_progress FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.bulk_imports bi
     JOIN public.users u ON ((u.id = auth.uid())))
  WHERE ((bi.id = import_progress.import_id) AND (u.institution_id = bi.institution_id)))));


--
-- Name: bulk_imports Users can view their institution's bulk imports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their institution's bulk imports" ON public.bulk_imports FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.institution_id = bulk_imports.institution_id)))));


--
-- Name: bulk_role_assignment_items Users can view their own assignment items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own assignment items" ON public.bulk_role_assignment_items FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: role_assignment_audit Users can view their own audit records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own audit records" ON public.role_assignment_audit FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: import_notifications Users can view their own import notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own import notifications" ON public.import_notifications FOR SELECT USING ((recipient_id = auth.uid()));


--
-- Name: role_assignment_notifications Users can view their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own notifications" ON public.role_assignment_notifications FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: import_warnings Users can view warnings for their institution's imports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view warnings for their institution's imports" ON public.import_warnings FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.bulk_imports bi
     JOIN public.users u ON ((u.id = auth.uid())))
  WHERE ((bi.id = import_warnings.import_id) AND (u.institution_id = bi.institution_id)))));


--
-- Name: assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: assignments assignments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assignments_delete ON public.assignments FOR DELETE TO authenticated USING (app_private.teaches_class(class_id));


--
-- Name: assignments assignments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assignments_insert ON public.assignments FOR INSERT TO authenticated WITH CHECK (((teacher_id = ( SELECT auth.uid() AS uid)) AND app_private.teaches_class(class_id)));


--
-- Name: assignments assignments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assignments_select ON public.assignments FOR SELECT TO authenticated USING ((app_private.teaches_class(class_id) OR app_private.is_enrolled_in(class_id) OR app_private.administers_class(class_id)));


--
-- Name: assignments assignments_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assignments_update ON public.assignments FOR UPDATE TO authenticated USING (app_private.teaches_class(class_id)) WITH CHECK (((teacher_id = ( SELECT auth.uid() AS uid)) AND app_private.teaches_class(class_id)));


--
-- Name: bulk_imports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bulk_imports ENABLE ROW LEVEL SECURITY;

--
-- Name: bulk_role_assignment_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bulk_role_assignment_items ENABLE ROW LEVEL SECURITY;

--
-- Name: bulk_role_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bulk_role_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: class_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: class_prerequisites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_prerequisites ENABLE ROW LEVEL SECURITY;

--
-- Name: classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

--
-- Name: classes classes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classes_delete ON public.classes FOR DELETE TO authenticated USING ((teacher_id = ( SELECT auth.uid() AS uid)));


--
-- Name: classes classes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classes_insert ON public.classes FOR INSERT TO authenticated WITH CHECK (((teacher_id = ( SELECT auth.uid() AS uid)) AND (app_private.my_role() = ANY (ARRAY['teacher'::text, 'department_admin'::text, 'institution_admin'::text])) AND ((institution_id IS NULL) OR (institution_id = app_private.my_institution_id()))));


--
-- Name: classes classes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classes_select ON public.classes FOR SELECT TO authenticated USING (((teacher_id = ( SELECT auth.uid() AS uid)) OR app_private.is_enrolled_in(id) OR app_private.is_institution_admin_of(institution_id)));


--
-- Name: classes classes_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classes_update ON public.classes FOR UPDATE TO authenticated USING ((teacher_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((teacher_id = ( SELECT auth.uid() AS uid)) AND ((institution_id IS NULL) OR (institution_id = app_private.my_institution_id()))));


--
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

--
-- Name: departments departments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY departments_select ON public.departments FOR SELECT TO authenticated USING (((institution_id = app_private.my_institution_id()) OR app_private.created_institution(institution_id)));


--
-- Name: departments departments_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY departments_write ON public.departments TO authenticated USING ((app_private.is_institution_admin_of(institution_id) OR app_private.created_institution(institution_id))) WITH CHECK ((app_private.is_institution_admin_of(institution_id) OR app_private.created_institution(institution_id)));


--
-- Name: enrollment_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enrollment_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: enrollment_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enrollment_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: enrollment_restrictions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enrollment_restrictions ENABLE ROW LEVEL SECURITY;

--
-- Name: enrollment_statistics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enrollment_statistics ENABLE ROW LEVEL SECURITY;

--
-- Name: enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: enrollments enrollments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY enrollments_delete ON public.enrollments FOR DELETE TO authenticated USING (((student_id = ( SELECT auth.uid() AS uid)) OR app_private.teaches_class(class_id)));


--
-- Name: enrollments enrollments_insert_by_teacher; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY enrollments_insert_by_teacher ON public.enrollments FOR INSERT TO authenticated WITH CHECK (app_private.teaches_class(class_id));


--
-- Name: enrollments enrollments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY enrollments_select ON public.enrollments FOR SELECT TO authenticated USING (((student_id = ( SELECT auth.uid() AS uid)) OR app_private.teaches_class(class_id) OR app_private.administers_class(class_id)));


--
-- Name: enrollments enrollments_update_by_teacher; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY enrollments_update_by_teacher ON public.enrollments FOR UPDATE TO authenticated USING (app_private.teaches_class(class_id)) WITH CHECK (app_private.teaches_class(class_id));


--
-- Name: import_errors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.import_errors ENABLE ROW LEVEL SECURITY;

--
-- Name: import_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.import_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: import_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.import_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: import_warnings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.import_warnings ENABLE ROW LEVEL SECURITY;

--
-- Name: institution_domains; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.institution_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: institutional_role_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.institutional_role_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: institutions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;

--
-- Name: institutions institutions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY institutions_delete ON public.institutions FOR DELETE TO authenticated USING ((created_by = ( SELECT auth.uid() AS uid)));


--
-- Name: institutions institutions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY institutions_insert ON public.institutions FOR INSERT TO authenticated WITH CHECK ((created_by = ( SELECT auth.uid() AS uid)));


--
-- Name: institutions institutions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY institutions_select ON public.institutions FOR SELECT TO authenticated USING (true);


--
-- Name: institutions institutions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY institutions_update ON public.institutions FOR UPDATE TO authenticated USING ((app_private.is_institution_admin_of(id) OR (created_by = ( SELECT auth.uid() AS uid)))) WITH CHECK ((app_private.is_institution_admin_of(id) OR (created_by = ( SELECT auth.uid() AS uid))));


--
-- Name: invitation_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invitation_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: migration_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.migration_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_delivery_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_delivery_log ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notifications notifications_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR app_private.teaches_student(user_id) OR app_private.is_my_teacher(user_id) OR app_private.administers_user(user_id)));


--
-- Name: notifications notifications_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notifications notifications_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: onboarding_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: peer_review_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.peer_review_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: peer_review_activity peer_review_activity_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY peer_review_activity_insert ON public.peer_review_activity FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (app_private.owns_peer_review_assignment(peer_review_assignment_id) OR app_private.participates_in_peer_review(peer_review_assignment_id))));


--
-- Name: peer_review_activity peer_review_activity_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY peer_review_activity_select ON public.peer_review_activity FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR app_private.owns_peer_review_assignment(peer_review_assignment_id)));


--
-- Name: peer_review_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.peer_review_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: peer_review_assignments peer_review_assignments_teacher; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY peer_review_assignments_teacher ON public.peer_review_assignments TO authenticated USING ((teacher_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((teacher_id = ( SELECT auth.uid() AS uid)) AND app_private.teaches_class(class_id) AND (EXISTS ( SELECT 1
   FROM public.assignments a
  WHERE ((a.id = peer_review_assignments.assignment_id) AND (a.class_id = peer_review_assignments.class_id))))));


--
-- Name: peer_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.peer_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: peer_reviews peer_reviews_teacher_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY peer_reviews_teacher_delete ON public.peer_reviews FOR DELETE TO authenticated USING (app_private.owns_peer_review_assignment(peer_review_assignment_id));


--
-- Name: peer_reviews peer_reviews_teacher_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY peer_reviews_teacher_select ON public.peer_reviews FOR SELECT TO authenticated USING (app_private.owns_peer_review_assignment(peer_review_assignment_id));


--
-- Name: peer_reviews peer_reviews_teacher_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY peer_reviews_teacher_update ON public.peer_reviews FOR UPDATE TO authenticated USING (app_private.owns_peer_review_assignment(peer_review_assignment_id)) WITH CHECK (app_private.owns_peer_review_assignment(peer_review_assignment_id));


--
-- Name: permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: role_assignment_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_assignment_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: role_assignment_conflicts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_assignment_conflicts ENABLE ROW LEVEL SECURITY;

--
-- Name: role_assignment_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_assignment_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: role_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: role_audit_log role_audit_log_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_audit_log_select ON public.role_audit_log FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR app_private.is_institution_admin_of(institution_id)));


--
-- Name: role_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: role_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: role_requests role_requests_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_requests_select ON public.role_requests FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR app_private.is_institution_admin_of(institution_id)));


--
-- Name: rubric_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rubric_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: rubric_criteria; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rubric_criteria ENABLE ROW LEVEL SECURITY;

--
-- Name: rubric_criteria rubric_criteria_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rubric_criteria_select ON public.rubric_criteria FOR SELECT TO authenticated USING (app_private.can_view_rubric(rubric_id));


--
-- Name: rubric_criteria rubric_criteria_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rubric_criteria_write ON public.rubric_criteria TO authenticated USING (app_private.owns_rubric(rubric_id)) WITH CHECK (app_private.owns_rubric(rubric_id));


--
-- Name: rubric_levels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rubric_levels ENABLE ROW LEVEL SECURITY;

--
-- Name: rubric_levels rubric_levels_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rubric_levels_select ON public.rubric_levels FOR SELECT TO authenticated USING (app_private.can_view_criterion(criterion_id));


--
-- Name: rubric_levels rubric_levels_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rubric_levels_write ON public.rubric_levels TO authenticated USING (app_private.owns_criterion(criterion_id)) WITH CHECK (app_private.owns_criterion(criterion_id));


--
-- Name: rubric_quality_indicators; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rubric_quality_indicators ENABLE ROW LEVEL SECURITY;

--
-- Name: rubric_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rubric_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: rubrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;

--
-- Name: rubrics rubrics_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rubrics_select ON public.rubrics FOR SELECT TO authenticated USING (((teacher_id = ( SELECT auth.uid() AS uid)) OR app_private.can_view_rubric(id)));


--
-- Name: rubrics rubrics_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rubrics_write ON public.rubrics TO authenticated USING ((teacher_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((teacher_id = ( SELECT auth.uid() AS uid)));


--
-- Name: submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: submissions submissions_delete_by_teacher; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY submissions_delete_by_teacher ON public.submissions FOR DELETE TO authenticated USING (app_private.teaches_assignment(assignment_id));


--
-- Name: submissions submissions_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY submissions_insert_own ON public.submissions FOR INSERT TO authenticated WITH CHECK (((student_id = ( SELECT auth.uid() AS uid)) AND app_private.is_enrolled_for_assignment(assignment_id)));


--
-- Name: submissions submissions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY submissions_select ON public.submissions FOR SELECT TO authenticated USING (((student_id = ( SELECT auth.uid() AS uid)) OR app_private.teaches_assignment(assignment_id)));


--
-- Name: submissions submissions_update_by_teacher; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY submissions_update_by_teacher ON public.submissions FOR UPDATE TO authenticated USING (app_private.teaches_assignment(assignment_id)) WITH CHECK (app_private.teaches_assignment(assignment_id));


--
-- Name: submissions submissions_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY submissions_update_own ON public.submissions FOR UPDATE TO authenticated USING ((student_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((student_id = ( SELECT auth.uid() AS uid)) AND app_private.is_enrolled_for_assignment(assignment_id)));


--
-- Name: user_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_role_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_insert_self ON public.users FOR INSERT TO authenticated WITH CHECK ((id = ( SELECT auth.uid() AS uid)));


--
-- Name: users users_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_select ON public.users FOR SELECT TO authenticated USING (((id = ( SELECT auth.uid() AS uid)) OR app_private.teaches_student(id) OR app_private.is_my_teacher(id) OR app_private.is_institution_admin_of(institution_id)));


--
-- Name: users users_update_by_institution_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_by_institution_admin ON public.users FOR UPDATE TO authenticated USING (app_private.is_institution_admin_of(institution_id)) WITH CHECK (((institution_id IS NULL) OR app_private.is_institution_admin_of(institution_id)));


--
-- Name: users users_update_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_self ON public.users FOR UPDATE TO authenticated USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK ((id = ( SELECT auth.uid() AS uid)));


--
-- Name: waitlist_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: waitlist_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.waitlist_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA app_private; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA app_private TO authenticated;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION administers_class(p_class uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.administers_class(p_class uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.administers_class(p_class uuid) TO authenticated;


--
-- Name: FUNCTION administers_user(p_user uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.administers_user(p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.administers_user(p_user uuid) TO authenticated;


--
-- Name: FUNCTION can_view_criterion(p_criterion uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.can_view_criterion(p_criterion uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.can_view_criterion(p_criterion uuid) TO authenticated;


--
-- Name: FUNCTION can_view_rubric(p_rubric uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.can_view_rubric(p_rubric uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.can_view_rubric(p_rubric uuid) TO authenticated;


--
-- Name: FUNCTION created_institution(p_institution uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.created_institution(p_institution uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.created_institution(p_institution uuid) TO authenticated;


--
-- Name: FUNCTION is_enrolled_for_assignment(p_assignment uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.is_enrolled_for_assignment(p_assignment uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.is_enrolled_for_assignment(p_assignment uuid) TO authenticated;


--
-- Name: FUNCTION is_enrolled_in(p_class uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.is_enrolled_in(p_class uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.is_enrolled_in(p_class uuid) TO authenticated;


--
-- Name: FUNCTION is_institution_admin_of(p_institution uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.is_institution_admin_of(p_institution uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.is_institution_admin_of(p_institution uuid) TO authenticated;


--
-- Name: FUNCTION is_my_teacher(p_teacher uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.is_my_teacher(p_teacher uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.is_my_teacher(p_teacher uuid) TO authenticated;


--
-- Name: FUNCTION is_trusted_caller(); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.is_trusted_caller() FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.is_trusted_caller() TO authenticated;


--
-- Name: FUNCTION my_institution_id(); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.my_institution_id() FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.my_institution_id() TO authenticated;


--
-- Name: FUNCTION my_role(); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.my_role() FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.my_role() TO authenticated;


--
-- Name: FUNCTION owns_criterion(p_criterion uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.owns_criterion(p_criterion uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.owns_criterion(p_criterion uuid) TO authenticated;


--
-- Name: FUNCTION owns_peer_review_assignment(p_id uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.owns_peer_review_assignment(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.owns_peer_review_assignment(p_id uuid) TO authenticated;


--
-- Name: FUNCTION owns_rubric(p_rubric uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.owns_rubric(p_rubric uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.owns_rubric(p_rubric uuid) TO authenticated;


--
-- Name: FUNCTION participates_in_peer_review(p_id uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.participates_in_peer_review(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.participates_in_peer_review(p_id uuid) TO authenticated;


--
-- Name: FUNCTION reviews_submission(p_submission uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.reviews_submission(p_submission uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.reviews_submission(p_submission uuid) TO authenticated;


--
-- Name: FUNCTION reviews_submission_path(p_name text); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.reviews_submission_path(p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.reviews_submission_path(p_name text) TO authenticated;


--
-- Name: FUNCTION teaches_assignment(p_assignment uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.teaches_assignment(p_assignment uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.teaches_assignment(p_assignment uuid) TO authenticated;


--
-- Name: FUNCTION teaches_class(p_class uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.teaches_class(p_class uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.teaches_class(p_class uuid) TO authenticated;


--
-- Name: FUNCTION teaches_student(p_student uuid); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.teaches_student(p_student uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.teaches_student(p_student uuid) TO authenticated;


--
-- Name: FUNCTION teaches_submission_path(p_name text); Type: ACL; Schema: app_private; Owner: -
--

REVOKE ALL ON FUNCTION app_private.teaches_submission_path(p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION app_private.teaches_submission_path(p_name text) TO authenticated;


--
-- Name: FUNCTION cleanup_expired_notifications(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cleanup_expired_notifications() TO anon;
GRANT ALL ON FUNCTION public.cleanup_expired_notifications() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_expired_notifications() TO service_role;


--
-- Name: FUNCTION cleanup_expired_role_requests(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cleanup_expired_role_requests() TO anon;
GRANT ALL ON FUNCTION public.cleanup_expired_role_requests() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_expired_role_requests() TO service_role;


--
-- Name: FUNCTION create_default_notification_preferences(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_default_notification_preferences() TO anon;
GRANT ALL ON FUNCTION public.create_default_notification_preferences() TO authenticated;
GRANT ALL ON FUNCTION public.create_default_notification_preferences() TO service_role;


--
-- Name: FUNCTION create_notification(p_user_id uuid, p_type character varying, p_title character varying, p_message text, p_priority character varying, p_action_url text, p_action_label character varying, p_metadata jsonb, p_expires_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_notification(p_user_id uuid, p_type character varying, p_title character varying, p_message text, p_priority character varying, p_action_url text, p_action_label character varying, p_metadata jsonb, p_expires_at timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.create_notification(p_user_id uuid, p_type character varying, p_title character varying, p_message text, p_priority character varying, p_action_url text, p_action_label character varying, p_metadata jsonb, p_expires_at timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.create_notification(p_user_id uuid, p_type character varying, p_title character varying, p_message text, p_priority character varying, p_action_url text, p_action_label character varying, p_metadata jsonb, p_expires_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION create_savepoint(savepoint_name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_savepoint(savepoint_name text) TO anon;
GRANT ALL ON FUNCTION public.create_savepoint(savepoint_name text) TO authenticated;
GRANT ALL ON FUNCTION public.create_savepoint(savepoint_name text) TO service_role;


--
-- Name: FUNCTION expire_temporary_roles(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.expire_temporary_roles() TO anon;
GRANT ALL ON FUNCTION public.expire_temporary_roles() TO authenticated;
GRANT ALL ON FUNCTION public.expire_temporary_roles() TO service_role;


--
-- Name: FUNCTION get_bulk_assignment_stats(p_assignment_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_bulk_assignment_stats(p_assignment_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_bulk_assignment_stats(p_assignment_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_bulk_assignment_stats(p_assignment_id uuid) TO service_role;


--
-- Name: FUNCTION get_my_peer_review_tasks(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_peer_review_tasks() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_peer_review_tasks() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_peer_review_tasks() TO service_role;


--
-- Name: FUNCTION get_my_received_peer_reviews(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_received_peer_reviews() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_received_peer_reviews() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_received_peer_reviews() TO service_role;


--
-- Name: FUNCTION get_notification_summary(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_notification_summary(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_notification_summary(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_notification_summary(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_peer_review(p_review_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_peer_review(p_review_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_peer_review(p_review_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_peer_review(p_review_id uuid) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION increment_class_enrollment(class_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.increment_class_enrollment(class_id uuid) TO anon;
GRANT ALL ON FUNCTION public.increment_class_enrollment(class_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.increment_class_enrollment(class_id uuid) TO service_role;


--
-- Name: FUNCTION join_class_by_code(p_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.join_class_by_code(p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_class_by_code(p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.join_class_by_code(p_code text) TO service_role;


--
-- Name: FUNCTION log_role_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_role_change() TO anon;
GRANT ALL ON FUNCTION public.log_role_change() TO authenticated;
GRANT ALL ON FUNCTION public.log_role_change() TO service_role;


--
-- Name: FUNCTION mark_notifications_read(p_user_id uuid, p_notification_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mark_notifications_read(p_user_id uuid, p_notification_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.mark_notifications_read(p_user_id uuid, p_notification_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.mark_notifications_read(p_user_id uuid, p_notification_ids uuid[]) TO service_role;


--
-- Name: FUNCTION publish_peer_review(p_peer_review_assignment_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.publish_peer_review(p_peer_review_assignment_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.publish_peer_review(p_peer_review_assignment_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.publish_peer_review(p_peer_review_assignment_id uuid) TO service_role;


--
-- Name: FUNCTION rate_peer_review_helpfulness(p_review_id uuid, p_rating integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rate_peer_review_helpfulness(p_review_id uuid, p_rating integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rate_peer_review_helpfulness(p_review_id uuid, p_rating integer) TO authenticated;
GRANT ALL ON FUNCTION public.rate_peer_review_helpfulness(p_review_id uuid, p_rating integer) TO service_role;


--
-- Name: FUNCTION request_role(p_requested_role text, p_justification text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.request_role(p_requested_role text, p_justification text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_role(p_requested_role text, p_justification text) TO authenticated;
GRANT ALL ON FUNCTION public.request_role(p_requested_role text, p_justification text) TO service_role;


--
-- Name: FUNCTION review_role_request(p_request_id uuid, p_approve boolean, p_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.review_role_request(p_request_id uuid, p_approve boolean, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.review_role_request(p_request_id uuid, p_approve boolean, p_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.review_role_request(p_request_id uuid, p_approve boolean, p_notes text) TO service_role;


--
-- Name: FUNCTION save_peer_review(p_review_id uuid, p_overall_rating integer, p_feedback jsonb, p_minutes integer, p_submit boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_peer_review(p_review_id uuid, p_overall_rating integer, p_feedback jsonb, p_minutes integer, p_submit boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_peer_review(p_review_id uuid, p_overall_rating integer, p_feedback jsonb, p_minutes integer, p_submit boolean) TO authenticated;
GRANT ALL ON FUNCTION public.save_peer_review(p_review_id uuid, p_overall_rating integer, p_feedback jsonb, p_minutes integer, p_submit boolean) TO service_role;


--
-- Name: FUNCTION update_class_enrollment_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_class_enrollment_count() TO anon;
GRANT ALL ON FUNCTION public.update_class_enrollment_count() TO authenticated;
GRANT ALL ON FUNCTION public.update_class_enrollment_count() TO service_role;


--
-- Name: FUNCTION update_enrollment_count(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_enrollment_count() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_enrollment_count() TO service_role;


--
-- Name: FUNCTION update_enrollment_counts(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_enrollment_counts() TO anon;
GRANT ALL ON FUNCTION public.update_enrollment_counts() TO authenticated;
GRANT ALL ON FUNCTION public.update_enrollment_counts() TO service_role;


--
-- Name: FUNCTION update_enrollment_statistics(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_enrollment_statistics() TO anon;
GRANT ALL ON FUNCTION public.update_enrollment_statistics() TO authenticated;
GRANT ALL ON FUNCTION public.update_enrollment_statistics() TO service_role;


--
-- Name: FUNCTION update_rubric_total_points(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_rubric_total_points() TO anon;
GRANT ALL ON FUNCTION public.update_rubric_total_points() TO authenticated;
GRANT ALL ON FUNCTION public.update_rubric_total_points() TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: FUNCTION update_waitlist_positions(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_waitlist_positions() TO anon;
GRANT ALL ON FUNCTION public.update_waitlist_positions() TO authenticated;
GRANT ALL ON FUNCTION public.update_waitlist_positions() TO service_role;


--
-- Name: FUNCTION validate_role_transition(p_institution_id uuid, p_user_id uuid, p_from_role character varying, p_to_role character varying, p_department_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_role_transition(p_institution_id uuid, p_user_id uuid, p_from_role character varying, p_to_role character varying, p_department_id uuid) TO anon;
GRANT ALL ON FUNCTION public.validate_role_transition(p_institution_id uuid, p_user_id uuid, p_from_role character varying, p_to_role character varying, p_department_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.validate_role_transition(p_institution_id uuid, p_user_id uuid, p_from_role character varying, p_to_role character varying, p_department_id uuid) TO service_role;


--
-- Name: TABLE assignments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.assignments TO authenticated;
GRANT ALL ON TABLE public.assignments TO service_role;


--
-- Name: TABLE bulk_imports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bulk_imports TO anon;
GRANT ALL ON TABLE public.bulk_imports TO authenticated;
GRANT ALL ON TABLE public.bulk_imports TO service_role;


--
-- Name: TABLE bulk_role_assignment_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bulk_role_assignment_items TO anon;
GRANT ALL ON TABLE public.bulk_role_assignment_items TO authenticated;
GRANT ALL ON TABLE public.bulk_role_assignment_items TO service_role;


--
-- Name: TABLE bulk_role_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bulk_role_assignments TO anon;
GRANT ALL ON TABLE public.bulk_role_assignments TO authenticated;
GRANT ALL ON TABLE public.bulk_role_assignments TO service_role;


--
-- Name: TABLE class_invitations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.class_invitations TO anon;
GRANT ALL ON TABLE public.class_invitations TO authenticated;
GRANT ALL ON TABLE public.class_invitations TO service_role;


--
-- Name: TABLE class_prerequisites; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.class_prerequisites TO anon;
GRANT ALL ON TABLE public.class_prerequisites TO authenticated;
GRANT ALL ON TABLE public.class_prerequisites TO service_role;


--
-- Name: TABLE classes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.classes TO authenticated;
GRANT ALL ON TABLE public.classes TO service_role;


--
-- Name: TABLE departments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.departments TO authenticated;
GRANT ALL ON TABLE public.departments TO service_role;


--
-- Name: TABLE enrollment_audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.enrollment_audit_log TO anon;
GRANT ALL ON TABLE public.enrollment_audit_log TO authenticated;
GRANT ALL ON TABLE public.enrollment_audit_log TO service_role;


--
-- Name: TABLE enrollment_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.enrollment_requests TO anon;
GRANT ALL ON TABLE public.enrollment_requests TO authenticated;
GRANT ALL ON TABLE public.enrollment_requests TO service_role;


--
-- Name: TABLE enrollment_restrictions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.enrollment_restrictions TO anon;
GRANT ALL ON TABLE public.enrollment_restrictions TO authenticated;
GRANT ALL ON TABLE public.enrollment_restrictions TO service_role;


--
-- Name: TABLE enrollment_statistics; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.enrollment_statistics TO anon;
GRANT ALL ON TABLE public.enrollment_statistics TO authenticated;
GRANT ALL ON TABLE public.enrollment_statistics TO service_role;


--
-- Name: TABLE enrollments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.enrollments TO authenticated;
GRANT ALL ON TABLE public.enrollments TO service_role;


--
-- Name: TABLE import_errors; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.import_errors TO anon;
GRANT ALL ON TABLE public.import_errors TO authenticated;
GRANT ALL ON TABLE public.import_errors TO service_role;


--
-- Name: TABLE import_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.import_notifications TO anon;
GRANT ALL ON TABLE public.import_notifications TO authenticated;
GRANT ALL ON TABLE public.import_notifications TO service_role;


--
-- Name: TABLE import_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.import_progress TO anon;
GRANT ALL ON TABLE public.import_progress TO authenticated;
GRANT ALL ON TABLE public.import_progress TO service_role;


--
-- Name: TABLE import_warnings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.import_warnings TO anon;
GRANT ALL ON TABLE public.import_warnings TO authenticated;
GRANT ALL ON TABLE public.import_warnings TO service_role;


--
-- Name: TABLE institution_domains; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.institution_domains TO anon;
GRANT ALL ON TABLE public.institution_domains TO authenticated;
GRANT ALL ON TABLE public.institution_domains TO service_role;


--
-- Name: TABLE institutional_role_policies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.institutional_role_policies TO anon;
GRANT ALL ON TABLE public.institutional_role_policies TO authenticated;
GRANT ALL ON TABLE public.institutional_role_policies TO service_role;


--
-- Name: TABLE institutions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.institutions TO authenticated;
GRANT ALL ON TABLE public.institutions TO service_role;


--
-- Name: TABLE invitation_audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.invitation_audit_log TO anon;
GRANT ALL ON TABLE public.invitation_audit_log TO authenticated;
GRANT ALL ON TABLE public.invitation_audit_log TO service_role;


--
-- Name: TABLE migration_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.migration_snapshots TO anon;
GRANT ALL ON TABLE public.migration_snapshots TO authenticated;
GRANT ALL ON TABLE public.migration_snapshots TO service_role;


--
-- Name: TABLE notification_delivery_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_delivery_log TO anon;
GRANT ALL ON TABLE public.notification_delivery_log TO authenticated;
GRANT ALL ON TABLE public.notification_delivery_log TO service_role;


--
-- Name: TABLE notification_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_preferences TO anon;
GRANT ALL ON TABLE public.notification_preferences TO authenticated;
GRANT ALL ON TABLE public.notification_preferences TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE onboarding_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.onboarding_sessions TO anon;
GRANT ALL ON TABLE public.onboarding_sessions TO authenticated;
GRANT ALL ON TABLE public.onboarding_sessions TO service_role;


--
-- Name: TABLE peer_review_activity; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.peer_review_activity TO authenticated;
GRANT ALL ON TABLE public.peer_review_activity TO service_role;


--
-- Name: TABLE peer_review_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.peer_review_assignments TO authenticated;
GRANT ALL ON TABLE public.peer_review_assignments TO service_role;


--
-- Name: TABLE peer_reviews; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.peer_reviews TO authenticated;
GRANT ALL ON TABLE public.peer_reviews TO service_role;


--
-- Name: TABLE permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.permissions TO anon;
GRANT ALL ON TABLE public.permissions TO authenticated;
GRANT ALL ON TABLE public.permissions TO service_role;


--
-- Name: TABLE role_assignment_audit; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.role_assignment_audit TO anon;
GRANT ALL ON TABLE public.role_assignment_audit TO authenticated;
GRANT ALL ON TABLE public.role_assignment_audit TO service_role;


--
-- Name: TABLE role_assignment_conflicts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.role_assignment_conflicts TO anon;
GRANT ALL ON TABLE public.role_assignment_conflicts TO authenticated;
GRANT ALL ON TABLE public.role_assignment_conflicts TO service_role;


--
-- Name: TABLE role_assignment_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.role_assignment_notifications TO anon;
GRANT ALL ON TABLE public.role_assignment_notifications TO authenticated;
GRANT ALL ON TABLE public.role_assignment_notifications TO service_role;


--
-- Name: TABLE role_audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.role_audit_log TO authenticated;
GRANT ALL ON TABLE public.role_audit_log TO service_role;


--
-- Name: TABLE role_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.role_permissions TO anon;
GRANT ALL ON TABLE public.role_permissions TO authenticated;
GRANT ALL ON TABLE public.role_permissions TO service_role;


--
-- Name: TABLE role_requests; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.role_requests TO authenticated;
GRANT ALL ON TABLE public.role_requests TO service_role;


--
-- Name: TABLE rubric_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rubric_assignments TO anon;
GRANT ALL ON TABLE public.rubric_assignments TO authenticated;
GRANT ALL ON TABLE public.rubric_assignments TO service_role;


--
-- Name: TABLE rubric_criteria; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.rubric_criteria TO authenticated;
GRANT ALL ON TABLE public.rubric_criteria TO service_role;


--
-- Name: TABLE rubric_levels; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.rubric_levels TO authenticated;
GRANT ALL ON TABLE public.rubric_levels TO service_role;


--
-- Name: TABLE rubric_quality_indicators; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rubric_quality_indicators TO anon;
GRANT ALL ON TABLE public.rubric_quality_indicators TO authenticated;
GRANT ALL ON TABLE public.rubric_quality_indicators TO service_role;


--
-- Name: TABLE rubric_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rubric_templates TO anon;
GRANT ALL ON TABLE public.rubric_templates TO authenticated;
GRANT ALL ON TABLE public.rubric_templates TO service_role;


--
-- Name: TABLE rubrics; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.rubrics TO authenticated;
GRANT ALL ON TABLE public.rubrics TO service_role;


--
-- Name: TABLE submissions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.submissions TO authenticated;
GRANT ALL ON TABLE public.submissions TO service_role;


--
-- Name: TABLE user_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_profiles TO anon;
GRANT ALL ON TABLE public.user_profiles TO authenticated;
GRANT ALL ON TABLE public.user_profiles TO service_role;


--
-- Name: TABLE user_role_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_role_assignments TO anon;
GRANT ALL ON TABLE public.user_role_assignments TO authenticated;
GRANT ALL ON TABLE public.user_role_assignments TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: TABLE waitlist_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.waitlist_entries TO anon;
GRANT ALL ON TABLE public.waitlist_entries TO authenticated;
GRANT ALL ON TABLE public.waitlist_entries TO service_role;


--
-- Name: TABLE waitlist_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.waitlist_notifications TO anon;
GRANT ALL ON TABLE public.waitlist_notifications TO authenticated;
GRANT ALL ON TABLE public.waitlist_notifications TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--


-- =============================================================================
-- Objects outside public / app_private
-- =============================================================================

-- Create a public.users row for every new auth user (see handle_new_user).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage buckets (both private).
INSERT INTO storage.buckets (id, name, public)
VALUES ('submissions', 'submissions', false),
       ('Project Nest', 'Project Nest', false)
ON CONFLICT (id) DO NOTHING;

-- Submission files are stored as "<student_id>/<assignment_id>/<file>".
DROP POLICY IF EXISTS "Students can upload their own submissions" ON storage.objects;
CREATE POLICY "Students can upload their own submissions" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'submissions' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Students can view their own submissions" ON storage.objects;
CREATE POLICY "Students can view their own submissions" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'submissions' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Teachers can view class submissions" ON storage.objects;
CREATE POLICY "Teachers can view class submissions" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'submissions' AND app_private.teaches_submission_path(name));

DROP POLICY IF EXISTS "Peer reviewers can view assigned submissions" ON storage.objects;
CREATE POLICY "Peer reviewers can view assigned submissions" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'submissions' AND app_private.reviews_submission_path(name));

-- pg_dump cleared search_path for the session; restore the default so later
-- migrations run in the usual environment.
SELECT pg_catalog.set_config('search_path', '"$user", public, extensions', false);
