-- Support requests: anyone signed in (learner, tutor, school admin, programme
-- viewer) can raise a complaint, report a problem or ask a question, and the
-- programme team (platform admins) answer in a thread.
--
-- Rows are written only through the functions below. People see their own
-- requests; platform admins see every request through platform_* functions
-- (aal2 required, like the rest of the platform dashboard).

CREATE TABLE IF NOT EXISTS public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  -- The requester's school when they asked (kept if they move school).
  institution_id uuid REFERENCES public.institutions (id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('complaint', 'technical', 'question', 'safeguarding', 'other')),
  subject text NOT NULL CHECK (length(btrim(subject)) BETWEEN 3 AND 150),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS support_requests_requester ON public.support_requests (requester_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS support_requests_status ON public.support_requests (status, last_activity_at DESC);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.support_requests (id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  from_staff boolean NOT NULL DEFAULT false,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  link_url text CHECK (link_url IS NULL OR (link_url ~* '^https?://' AND length(link_url) <= 2000)),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS support_messages_request ON public.support_messages (request_id, created_at);

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_requests, public.support_messages FROM PUBLIC, anon;
GRANT SELECT ON public.support_requests, public.support_messages TO authenticated;

DROP POLICY IF EXISTS support_requests_select ON public.support_requests;
CREATE POLICY support_requests_select ON public.support_requests
  FOR SELECT TO authenticated
  USING (requester_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS support_messages_select ON public.support_messages;
CREATE POLICY support_messages_select ON public.support_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.support_requests r
                 WHERE r.id = request_id AND r.requester_id = (SELECT auth.uid())));

CREATE OR REPLACE FUNCTION app_private.support_display_name(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), email::text)
  FROM public.users WHERE id = p_user;
$$;
REVOKE ALL ON FUNCTION app_private.support_display_name(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.clean_link(p_link text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF nullif(btrim(coalesce(p_link, '')), '') IS NULL THEN
    RETURN NULL;
  END IF;
  IF btrim(p_link) !~* '^https?://' THEN
    RAISE EXCEPTION 'Links must start with http:// or https://' USING ERRCODE = '22023';
  END IF;
  RETURN btrim(p_link);
END;
$$;
REVOKE ALL ON FUNCTION app_private.clean_link(text) FROM PUBLIC, anon, authenticated;

-- Raise a request. Every platform admin is notified; safeguarding concerns
-- are marked urgent.
CREATE OR REPLACE FUNCTION public.create_support_request(
  p_category text, p_subject text, p_body text, p_link text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
  v_school uuid;
  v_school_name text;
  v_name text;
  v_recent integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  IF p_category NOT IN ('complaint', 'technical', 'question', 'safeguarding', 'other') THEN
    RAISE EXCEPTION 'Choose what this is about' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_subject, ''))) < 3 THEN
    RAISE EXCEPTION 'Add a short subject' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_body, ''))) < 10 THEN
    RAISE EXCEPTION 'Describe what happened (at least a sentence)' USING ERRCODE = '22023';
  END IF;
  -- Keep one person from flooding the inbox.
  SELECT count(*) INTO v_recent FROM public.support_requests
  WHERE requester_id = auth.uid() AND created_at > now() - interval '1 hour';
  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'You have sent several requests in the last hour. Add to an existing one, or try again later.'
      USING ERRCODE = '54000';
  END IF;

  SELECT u.institution_id, i.name INTO v_school, v_school_name
  FROM public.users u LEFT JOIN public.institutions i ON i.id = u.institution_id
  WHERE u.id = auth.uid();
  v_name := app_private.support_display_name(auth.uid());

  INSERT INTO public.support_requests (requester_id, institution_id, category, subject)
  VALUES (auth.uid(), v_school, p_category, left(btrim(p_subject), 150))
  RETURNING id INTO v_id;
  INSERT INTO public.support_messages (request_id, author_id, body, link_url)
  VALUES (v_id, auth.uid(), left(btrim(p_body), 4000), app_private.clean_link(p_link));

  INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, action_label, metadata)
  SELECT a.id, 'support_request',
         left(CASE WHEN p_category = 'safeguarding' THEN 'Safeguarding concern: ' ELSE 'Support request: ' END
              || btrim(p_subject), 255),
         left(coalesce(v_name, 'Someone') || coalesce(' (' || v_school_name || ')', '') || ': ' || btrim(p_body), 500),
         CASE WHEN p_category = 'safeguarding' THEN 'urgent' WHEN p_category = 'complaint' THEN 'high' ELSE 'medium' END,
         '/dashboard/platform/support?request=' || v_id, 'Open',
         jsonb_build_object('request_id', v_id)
  FROM public.users a WHERE a.role = 'system_admin' AND a.id <> auth.uid();
  RETURN v_id;
END;
$$;

-- Add a message. The requester can reply to their own request (which reopens
-- it if it was resolved); platform admins can reply to any request.
CREATE OR REPLACE FUNCTION public.reply_support_request(
  p_request uuid, p_body text, p_link text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r public.support_requests;
  v_staff boolean;
BEGIN
  SELECT * INTO r FROM public.support_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF r.requester_id = auth.uid() THEN
    v_staff := false;
  ELSE
    PERFORM app_private.require_platform_admin();
    v_staff := true;
  END IF;
  IF r.status = 'closed' THEN
    RAISE EXCEPTION 'This request is closed. Start a new one if you still need help.' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_body, ''))) < 1 THEN
    RAISE EXCEPTION 'Write a message' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.support_messages (request_id, author_id, from_staff, body, link_url)
  VALUES (r.id, auth.uid(), v_staff, left(btrim(p_body), 4000), app_private.clean_link(p_link));

  UPDATE public.support_requests SET
    last_activity_at = now(),
    status = CASE
      WHEN v_staff AND status = 'open' THEN 'in_progress'
      WHEN NOT v_staff AND status = 'resolved' THEN 'open'
      ELSE status END,
    resolved_at = CASE WHEN NOT v_staff AND status = 'resolved' THEN NULL ELSE resolved_at END
  WHERE id = r.id;

  IF v_staff THEN
    INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, action_label, metadata)
    VALUES (r.requester_id, 'support_reply', left('Reply to: ' || r.subject, 255),
            left(btrim(p_body), 500), 'medium',
            '/dashboard/support?request=' || r.id, 'Read reply',
            jsonb_build_object('request_id', r.id));
  ELSE
    INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, action_label, metadata)
    SELECT a.id, 'support_request', left('New message on: ' || r.subject, 255),
           left(coalesce(app_private.support_display_name(auth.uid()), 'Requester') || ': ' || btrim(p_body), 500),
           CASE WHEN r.category = 'safeguarding' THEN 'urgent' ELSE 'medium' END,
           '/dashboard/platform/support?request=' || r.id, 'Open',
           jsonb_build_object('request_id', r.id)
    FROM public.users a WHERE a.role = 'system_admin';
  END IF;
END;
$$;

-- Platform inbox.
CREATE OR REPLACE FUNCTION public.platform_support_requests(p_status text DEFAULT 'active')
RETURNS TABLE (
  id uuid, category text, subject text, status text,
  requester_id uuid, requester_name text, requester_email text, requester_role text,
  school_name text, messages bigint, last_message text, last_from_staff boolean,
  created_at timestamptz, last_activity_at timestamptz, resolved_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_platform_admin();
  RETURN QUERY
  SELECT r.id, r.category, r.subject, r.status,
         r.requester_id, app_private.support_display_name(r.requester_id), u.email::text, u.role::text,
         i.name::text,
         (SELECT count(*) FROM public.support_messages m WHERE m.request_id = r.id),
         lm.body, lm.from_staff,
         r.created_at, r.last_activity_at, r.resolved_at
  FROM public.support_requests r
  LEFT JOIN public.users u ON u.id = r.requester_id
  LEFT JOIN public.institutions i ON i.id = r.institution_id
  LEFT JOIN LATERAL (
    SELECT m.body, m.from_staff FROM public.support_messages m
    WHERE m.request_id = r.id ORDER BY m.created_at DESC LIMIT 1
  ) lm ON true
  WHERE CASE coalesce(p_status, 'all')
          WHEN 'all' THEN true
          WHEN 'active' THEN r.status IN ('open', 'in_progress')
          ELSE r.status = p_status END
  ORDER BY (r.category = 'safeguarding' AND r.status IN ('open', 'in_progress')) DESC,
           r.last_activity_at DESC
  LIMIT 300;
END;
$$;

-- One thread (platform admins, or the requester).
CREATE OR REPLACE FUNCTION public.support_thread(p_request uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r public.support_requests;
BEGIN
  SELECT * INTO r FROM public.support_requests WHERE id = p_request;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF r.requester_id IS DISTINCT FROM auth.uid() THEN
    PERFORM app_private.require_platform_admin();
  END IF;
  RETURN jsonb_build_object(
    'request', to_jsonb(r) || jsonb_build_object(
      'requester_name', app_private.support_display_name(r.requester_id),
      'school_name', (SELECT name FROM public.institutions WHERE id = r.institution_id)),
    'messages', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', m.id, 'body', m.body, 'link_url', m.link_url,
               'from_staff', m.from_staff, 'created_at', m.created_at,
               -- Staff replies are signed "Programme team", not a personal name.
               'author', CASE WHEN m.from_staff THEN 'Programme team'
                              ELSE app_private.support_display_name(m.author_id) END)
             ORDER BY m.created_at)
      FROM public.support_messages m WHERE m.request_id = r.id), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_set_support_status(p_request uuid, p_status text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r public.support_requests;
BEGIN
  PERFORM app_private.require_platform_admin();
  IF p_status NOT IN ('open', 'in_progress', 'resolved', 'closed') THEN
    RAISE EXCEPTION 'Unknown status' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM public.support_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF r.status = p_status THEN
    RETURN;
  END IF;
  UPDATE public.support_requests SET
    status = p_status,
    last_activity_at = now(),
    resolved_at = CASE WHEN p_status IN ('resolved', 'closed') THEN now() ELSE NULL END
  WHERE id = r.id;
  PERFORM app_private.log_platform_action('support_status', 'support_request', r.id::text,
    jsonb_build_object('from', r.status, 'to', p_status));
  IF p_status IN ('resolved', 'closed') THEN
    INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, action_label, metadata)
    VALUES (r.requester_id, 'support_reply',
            left(CASE p_status WHEN 'resolved' THEN 'Resolved: ' ELSE 'Closed: ' END || r.subject, 255),
            CASE p_status
              WHEN 'resolved' THEN 'The programme team marked your request as resolved. Reply if you still need help.'
              ELSE 'The programme team closed your request.' END,
            'low', '/dashboard/support?request=' || r.id, 'View',
            jsonb_build_object('request_id', r.id));
  END IF;
END;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.create_support_request(text, text, text, text)',
    'public.reply_support_request(uuid, text, text)',
    'public.platform_support_requests(text)',
    'public.support_thread(uuid)',
    'public.platform_set_support_status(uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- New notification types (always delivered: not tied to a preference).
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
    'revision_requested',
    'nomination_submitted',
    'nomination_decided',
    'support_request',
    'support_reply',
    'role_changed',
    'system_message'
  )
);
