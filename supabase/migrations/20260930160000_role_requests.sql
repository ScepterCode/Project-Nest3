-- =============================================================================
-- Role requests: members ask for a role, their institution's admins decide
-- =============================================================================
-- Before: the profile form inserted a column that doesn't exist
-- (current_role; the column is existing_role), so no request was ever saved,
-- and nothing existed to review one.
--
-- After:
--   * request_role(): a member of an institution asks to become teacher or
--     institution_admin. One pending request at a time, max 3 per day,
--     expires after 30 days. The institution's admins get a notification.
--   * review_role_request(): an admin of the same institution (never the
--     requester) approves or denies. On approval the role change, the request
--     update and an audit-log entry happen in one transaction, after
--     re-checking the request (pending, not expired, requester still a member,
--     role unchanged since the request). The requester is notified.
--   * No direct writes to role_requests or role_audit_log: requesters read
--     their own rows, institution admins read their institution's.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Foreign keys pointed at user_profiles (a leftover second profile table with
-- one row), so no real user could ever have a request or audit entry. Point
-- them at public.users. Both tables are empty.
-- -----------------------------------------------------------------------------

ALTER TABLE public.role_requests DROP CONSTRAINT IF EXISTS fk_role_requests_user;
ALTER TABLE public.role_requests DROP CONSTRAINT IF EXISTS fk_role_requests_reviewed_by;
ALTER TABLE public.role_audit_log DROP CONSTRAINT IF EXISTS fk_role_audit_log_user;
ALTER TABLE public.role_audit_log DROP CONSTRAINT IF EXISTS fk_role_audit_log_changed_by;

ALTER TABLE public.role_requests
  ADD CONSTRAINT fk_role_requests_user
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_role_requests_reviewed_by
    FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.role_audit_log
  ADD CONSTRAINT fk_role_audit_log_user
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_role_audit_log_changed_by
    FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- Policies
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('role_requests', 'role_audit_log')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

ALTER TABLE public.role_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.role_requests, public.role_audit_log FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.role_requests, public.role_audit_log FROM authenticated;

CREATE POLICY role_requests_select ON public.role_requests
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR app_private.is_institution_admin_of(institution_id)
  );

CREATE POLICY role_audit_log_select ON public.role_audit_log
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR app_private.is_institution_admin_of(institution_id)
  );

CREATE INDEX IF NOT EXISTS idx_role_requests_institution_pending
  ON public.role_requests (institution_id, requested_at DESC)
  WHERE status = 'pending';

-- -----------------------------------------------------------------------------
-- request_role
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_role(p_requested_role text, p_justification text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- -----------------------------------------------------------------------------
-- review_role_request
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.review_role_request(p_request_id uuid, p_approve boolean, p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

REVOKE ALL ON FUNCTION public.request_role(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_role_request(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_role(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_role_request(uuid, boolean, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
