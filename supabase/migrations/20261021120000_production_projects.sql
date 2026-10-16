-- Production projects for the mentorship and fellowship stages: a team of
-- learners works through milestones (script, storyboard, animatic, …), hands
-- in each version as a link to where the files live (Drive, YouTube, …),
-- and the mentor approves it or asks for changes. ProjectNest keeps the
-- milestones, the version history and the approvals; the assets stay
-- elsewhere.
--
-- A project belongs to a mentorship/fellowship group (classes.cohort_stage).
-- Its mentor is the group's teacher; platform admins can do what a mentor
-- can. Rows are written only through the functions below.

CREATE TABLE IF NOT EXISTS public.production_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 150),
  brief text CHECK (brief IS NULL OR length(brief) <= 4000),
  assets_url text CHECK (assets_url IS NULL OR (assets_url ~* '^https?://' AND length(assets_url) <= 2000)),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS production_projects_class ON public.production_projects (class_id);

CREATE TABLE IF NOT EXISTS public.production_project_members (
  project_id uuid NOT NULL REFERENCES public.production_projects (id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  role_title text CHECK (role_title IS NULL OR length(role_title) <= 60),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, student_id)
);
CREATE INDEX IF NOT EXISTS production_project_members_student ON public.production_project_members (student_id);

CREATE TABLE IF NOT EXISTS public.production_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.production_projects (id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 120),
  description text CHECK (description IS NULL OR length(description) <= 2000),
  due_date date,
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'submitted', 'changes_requested', 'approved')),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS production_milestones_project ON public.production_milestones (project_id, position);

CREATE TABLE IF NOT EXISTS public.production_milestone_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL REFERENCES public.production_milestones (id) ON DELETE CASCADE,
  version integer NOT NULL,
  submitted_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  link_url text NOT NULL CHECK (link_url ~* '^https?://' AND length(link_url) <= 2000),
  note text CHECK (note IS NULL OR length(note) <= 2000),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  decision text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'approved', 'changes_requested', 'superseded')),
  decided_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  decision_note text CHECK (decision_note IS NULL OR length(decision_note) <= 2000),
  decided_at timestamptz,
  UNIQUE (milestone_id, version)
);

-- --- who can do what ---------------------------------------------------------

CREATE OR REPLACE FUNCTION app_private.mentors_project(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.production_projects p
    JOIN public.classes c ON c.id = p.class_id
    WHERE p.id = p_project AND c.teacher_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION app_private.on_project_team(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.production_project_members
                 WHERE project_id = p_project AND student_id = auth.uid())
$$;

-- Mentor, team, platform admins, and the school admins and tutors of anyone
-- on the team (through the existing learner visibility rule).
CREATE OR REPLACE FUNCTION app_private.can_view_project(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.mentors_project(p_project)
      OR app_private.on_project_team(p_project)
      OR EXISTS (SELECT 1 FROM public.production_project_members m
                 WHERE m.project_id = p_project AND m.student_id <> auth.uid()
                   AND app_private.can_view_learner(m.student_id)
                   AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()
                               AND u.role IN ('teacher', 'institution_admin', 'system_admin')))
$$;

CREATE OR REPLACE FUNCTION app_private.require_project_mentor(p_project uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.production_projects WHERE id = p_project) THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT app_private.mentors_project(p_project) THEN
    RAISE EXCEPTION 'Only the group''s mentor can change this project' USING ERRCODE = '42501';
  END IF;
END;
$$;

ALTER TABLE public.production_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_milestone_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.production_projects, public.production_project_members,
  public.production_milestones, public.production_milestone_versions FROM PUBLIC, anon;
GRANT SELECT ON public.production_projects, public.production_project_members,
  public.production_milestones, public.production_milestone_versions TO authenticated;

DROP POLICY IF EXISTS production_projects_select ON public.production_projects;
CREATE POLICY production_projects_select ON public.production_projects
  FOR SELECT TO authenticated USING (app_private.can_view_project(id));
DROP POLICY IF EXISTS production_project_members_select ON public.production_project_members;
CREATE POLICY production_project_members_select ON public.production_project_members
  FOR SELECT TO authenticated USING (app_private.can_view_project(project_id));
DROP POLICY IF EXISTS production_milestones_select ON public.production_milestones;
CREATE POLICY production_milestones_select ON public.production_milestones
  FOR SELECT TO authenticated USING (app_private.can_view_project(project_id));
DROP POLICY IF EXISTS production_milestone_versions_select ON public.production_milestone_versions;
CREATE POLICY production_milestone_versions_select ON public.production_milestone_versions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.production_milestones m
    WHERE m.id = milestone_id AND app_private.can_view_project(m.project_id)));

CREATE OR REPLACE FUNCTION app_private.project_name(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), email::text)
  FROM public.users WHERE id = p_user;
$$;

-- Notify everyone on a project's team (except the caller).
CREATE OR REPLACE FUNCTION app_private.notify_project_team(
  p_project uuid, p_title text, p_message text, p_priority text DEFAULT 'medium'
) RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, action_label, metadata)
  SELECT m.student_id, 'project_update', left(p_title, 255), left(p_message, 500), p_priority,
         '/dashboard/projects/' || p_project, 'Open project', jsonb_build_object('project_id', p_project)
  FROM public.production_project_members m
  WHERE m.project_id = p_project AND m.student_id IS DISTINCT FROM auth.uid();
$$;

-- --- projects and teams ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_production_project(
  p_class uuid, p_title text, p_brief text DEFAULT NULL, p_assets_url text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_class public.classes;
  v_id uuid;
BEGIN
  SELECT * INTO v_class FROM public.classes WHERE id = p_class;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (v_class.teacher_id = auth.uid() OR app_private.is_platform_admin()) THEN
    RAISE EXCEPTION 'Only the group''s mentor can start a project' USING ERRCODE = '42501';
  END IF;
  IF v_class.cohort_stage IS NULL THEN
    RAISE EXCEPTION 'Production projects are for mentorship and fellowship groups' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) < 3 THEN
    RAISE EXCEPTION 'Give the project a title' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.production_projects (class_id, title, brief, assets_url, created_by)
  VALUES (p_class, btrim(p_title), nullif(btrim(coalesce(p_brief, '')), ''),
          app_private.clean_link(p_assets_url), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_production_project(
  p_project uuid, p_title text, p_brief text, p_assets_url text, p_status text
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_old text;
BEGIN
  PERFORM app_private.require_project_mentor(p_project);
  IF p_status NOT IN ('active', 'completed', 'archived') THEN
    RAISE EXCEPTION 'Unknown status' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) < 3 THEN
    RAISE EXCEPTION 'Give the project a title' USING ERRCODE = '22023';
  END IF;
  SELECT status INTO v_old FROM public.production_projects WHERE id = p_project;
  UPDATE public.production_projects SET
    title = btrim(p_title),
    brief = nullif(btrim(coalesce(p_brief, '')), ''),
    assets_url = app_private.clean_link(p_assets_url),
    status = p_status,
    completed_at = CASE WHEN p_status = 'completed' THEN coalesce(completed_at, now()) ELSE NULL END
  WHERE id = p_project;
  IF p_status = 'completed' AND v_old <> 'completed' THEN
    PERFORM app_private.notify_project_team(p_project,
      'Project complete: ' || btrim(p_title), 'Your mentor marked the project as complete. Well done!');
  END IF;
END;
$$;

-- Replaces the team. Everyone must be in the project's group.
CREATE OR REPLACE FUNCTION public.set_project_team(p_project uuid, p_members jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_class uuid;
  v_title text;
  v_outsider uuid;
BEGIN
  PERFORM app_private.require_project_mentor(p_project);
  IF jsonb_typeof(coalesce(p_members, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Members must be a list' USING ERRCODE = '22023';
  END IF;
  SELECT class_id, title INTO v_class, v_title FROM public.production_projects WHERE id = p_project;

  SELECT (e ->> 'student_id')::uuid INTO v_outsider
  FROM jsonb_array_elements(coalesce(p_members, '[]'::jsonb)) e
  WHERE NOT EXISTS (SELECT 1 FROM public.enrollments en
                    WHERE en.class_id = v_class AND en.student_id = (e ->> 'student_id')::uuid
                      AND en.status IN ('enrolled', 'active'))
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Everyone on the team must be in this group' USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.new_team (student_id uuid PRIMARY KEY, role_title text) ON COMMIT DROP;
  DELETE FROM pg_temp.new_team;
  INSERT INTO pg_temp.new_team
  SELECT DISTINCT ON ((e ->> 'student_id')::uuid) (e ->> 'student_id')::uuid,
         nullif(left(btrim(coalesce(e ->> 'role_title', '')), 60), '')
  FROM jsonb_array_elements(coalesce(p_members, '[]'::jsonb)) e;

  DELETE FROM public.production_project_members m
  WHERE m.project_id = p_project AND NOT EXISTS (SELECT 1 FROM pg_temp.new_team t WHERE t.student_id = m.student_id);
  UPDATE public.production_project_members m SET role_title = t.role_title
  FROM pg_temp.new_team t WHERE m.project_id = p_project AND m.student_id = t.student_id;

  INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, action_label, metadata)
  SELECT t.student_id, 'project_update', left('You joined the project: ' || v_title, 255),
         coalesce('Your role: ' || t.role_title, 'Open the project to see its milestones.'), 'medium',
         '/dashboard/projects/' || p_project, 'Open project', jsonb_build_object('project_id', p_project)
  FROM pg_temp.new_team t
  WHERE NOT EXISTS (SELECT 1 FROM public.production_project_members m
                    WHERE m.project_id = p_project AND m.student_id = t.student_id);
  INSERT INTO public.production_project_members (project_id, student_id, role_title)
  SELECT p_project, t.student_id, t.role_title FROM pg_temp.new_team t
  ON CONFLICT (project_id, student_id) DO NOTHING;
END;
$$;

-- --- milestones --------------------------------------------------------------

-- p_milestone NULL adds one at the end.
CREATE OR REPLACE FUNCTION public.save_project_milestone(
  p_project uuid, p_milestone uuid, p_title text, p_description text DEFAULT NULL, p_due date DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM app_private.require_project_mentor(p_project);
  IF length(btrim(coalesce(p_title, ''))) < 2 THEN
    RAISE EXCEPTION 'Give the milestone a title' USING ERRCODE = '22023';
  END IF;
  IF p_milestone IS NULL THEN
    INSERT INTO public.production_milestones (project_id, position, title, description, due_date)
    SELECT p_project, coalesce(max(position) + 1, 0), btrim(p_title),
           nullif(btrim(coalesce(p_description, '')), ''), p_due
    FROM public.production_milestones WHERE project_id = p_project
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.production_milestones SET
      title = btrim(p_title),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      due_date = p_due
    WHERE id = p_milestone AND project_id = p_project
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Milestone not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN v_id;
END;
$$;

-- Only milestones nobody has handed anything in for can be removed.
CREATE OR REPLACE FUNCTION public.delete_project_milestone(p_milestone uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_project uuid;
BEGIN
  SELECT project_id INTO v_project FROM public.production_milestones WHERE id = p_milestone;
  IF v_project IS NULL THEN
    RAISE EXCEPTION 'Milestone not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM app_private.require_project_mentor(v_project);
  IF EXISTS (SELECT 1 FROM public.production_milestone_versions WHERE milestone_id = p_milestone) THEN
    RAISE EXCEPTION 'Work has been handed in for this milestone, so it can''t be removed' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.production_milestones WHERE id = p_milestone;
END;
$$;

-- A team member hands in a version: a link to where the files are.
CREATE OR REPLACE FUNCTION public.submit_milestone_version(p_milestone uuid, p_link text, p_note text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  ms public.production_milestones;
  v_project public.production_projects;
  v_version integer;
  v_mentor uuid;
BEGIN
  SELECT * INTO ms FROM public.production_milestones WHERE id = p_milestone FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Milestone not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT app_private.on_project_team(ms.project_id) THEN
    RAISE EXCEPTION 'Only the project team can hand in work' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_project FROM public.production_projects WHERE id = ms.project_id;
  IF v_project.status <> 'active' THEN
    RAISE EXCEPTION 'This project is %', v_project.status USING ERRCODE = '22023';
  END IF;
  IF ms.status = 'approved' THEN
    RAISE EXCEPTION 'This milestone is already approved' USING ERRCODE = '22023';
  END IF;
  IF app_private.clean_link(p_link) IS NULL THEN
    RAISE EXCEPTION 'Add a link to the work (Drive, YouTube, Vimeo…)' USING ERRCODE = '22023';
  END IF;

  -- A newer version replaces one still waiting for review.
  UPDATE public.production_milestone_versions SET decision = 'superseded'
  WHERE milestone_id = ms.id AND decision = 'pending';
  SELECT coalesce(max(version), 0) + 1 INTO v_version
  FROM public.production_milestone_versions WHERE milestone_id = ms.id;
  INSERT INTO public.production_milestone_versions (milestone_id, version, submitted_by, link_url, note)
  VALUES (ms.id, v_version, auth.uid(), app_private.clean_link(p_link), nullif(btrim(coalesce(p_note, '')), ''));
  UPDATE public.production_milestones SET status = 'submitted' WHERE id = ms.id;

  SELECT c.teacher_id INTO v_mentor FROM public.classes c WHERE c.id = v_project.class_id;
  INSERT INTO public.notifications (user_id, type, title, message, priority, action_url, action_label, metadata)
  VALUES (v_mentor, 'project_update',
          left(v_project.title || ': ' || ms.title || ' v' || v_version || ' ready for review', 255),
          left(coalesce(app_private.project_name(auth.uid()), 'The team') || ' handed in a version'
               || coalesce(': ' || nullif(btrim(coalesce(p_note, '')), ''), '.'), 500),
          'medium', '/dashboard/projects/' || v_project.id, 'Review',
          jsonb_build_object('project_id', v_project.id, 'milestone_id', ms.id));
  PERFORM app_private.notify_project_team(v_project.id,
    v_project.title || ': ' || ms.title || ' v' || v_version || ' handed in',
    coalesce(app_private.project_name(auth.uid()), 'A teammate') || ' handed in a new version for review.', 'low');
  RETURN v_version;
END;
$$;

-- The mentor approves the latest version or asks for changes.
CREATE OR REPLACE FUNCTION public.review_milestone_version(p_version uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v public.production_milestone_versions;
  ms public.production_milestones;
  v_title text;
BEGIN
  SELECT * INTO v FROM public.production_milestone_versions WHERE id = p_version FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO ms FROM public.production_milestones WHERE id = v.milestone_id FOR UPDATE;
  PERFORM app_private.require_project_mentor(ms.project_id);
  IF v.decision <> 'pending' THEN
    RAISE EXCEPTION 'This version has already been reviewed or replaced' USING ERRCODE = '22023';
  END IF;
  IF NOT p_approve AND length(btrim(coalesce(p_note, ''))) < 5 THEN
    RAISE EXCEPTION 'Say what needs to change' USING ERRCODE = '22023';
  END IF;

  UPDATE public.production_milestone_versions SET
    decision = CASE WHEN p_approve THEN 'approved' ELSE 'changes_requested' END,
    decided_by = auth.uid(), decision_note = nullif(btrim(coalesce(p_note, '')), ''), decided_at = now()
  WHERE id = v.id;
  UPDATE public.production_milestones SET
    status = CASE WHEN p_approve THEN 'approved' ELSE 'changes_requested' END,
    approved_at = CASE WHEN p_approve THEN now() ELSE NULL END
  WHERE id = ms.id;

  SELECT title INTO v_title FROM public.production_projects WHERE id = ms.project_id;
  PERFORM app_private.notify_project_team(ms.project_id,
    v_title || ': ' || ms.title || CASE WHEN p_approve THEN ' approved' ELSE ' needs changes' END,
    coalesce(nullif(btrim(coalesce(p_note, '')), ''),
             CASE WHEN p_approve THEN 'Your mentor approved version ' || v.version || '.' ELSE 'See the project for details.' END),
    CASE WHEN p_approve THEN 'medium' ELSE 'high' END);
END;
$$;

-- --- reading -----------------------------------------------------------------

-- Projects the caller mentors, is on, or (platform admins) all of them.
CREATE OR REPLACE FUNCTION public.my_production_projects()
RETURNS TABLE (
  id uuid, title text, status text, class_id uuid, class_name text, cohort_stage text,
  mentor_name text, team_size bigint, milestones bigint, approved bigint, waiting_review bigint,
  next_due date, i_mentor boolean, created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id, p.title, p.status, c.id, c.name::text, c.cohort_stage,
         app_private.project_name(c.teacher_id),
         (SELECT count(*) FROM public.production_project_members m WHERE m.project_id = p.id),
         (SELECT count(*) FROM public.production_milestones ms WHERE ms.project_id = p.id),
         (SELECT count(*) FROM public.production_milestones ms WHERE ms.project_id = p.id AND ms.status = 'approved'),
         (SELECT count(*) FROM public.production_milestones ms WHERE ms.project_id = p.id AND ms.status = 'submitted'),
         (SELECT min(ms.due_date) FROM public.production_milestones ms
           WHERE ms.project_id = p.id AND ms.status <> 'approved' AND ms.due_date IS NOT NULL),
         app_private.mentors_project(p.id),
         p.created_at
  FROM public.production_projects p
  JOIN public.classes c ON c.id = p.class_id
  WHERE app_private.can_view_project(p.id)
  ORDER BY (p.status = 'active') DESC, p.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.production_project_detail(p_project uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.production_projects;
BEGIN
  SELECT * INTO p FROM public.production_projects WHERE id = p_project;
  IF NOT FOUND OR NOT app_private.can_view_project(p_project) THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object(
    'project', to_jsonb(p) || (
      SELECT jsonb_build_object('class_name', c.name, 'cohort_stage', c.cohort_stage,
                                'mentor_id', c.teacher_id, 'mentor_name', app_private.project_name(c.teacher_id))
      FROM public.classes c WHERE c.id = p.class_id),
    'i_mentor', app_private.mentors_project(p.id),
    'i_member', app_private.on_project_team(p.id),
    'team', coalesce((
      SELECT jsonb_agg(jsonb_build_object('student_id', m.student_id, 'name', app_private.project_name(m.student_id),
                                          'role_title', m.role_title) ORDER BY m.added_at)
      FROM public.production_project_members m WHERE m.project_id = p.id), '[]'::jsonb),
    'milestones', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', ms.id, 'title', ms.title, 'description', ms.description, 'due_date', ms.due_date,
               'status', ms.status, 'approved_at', ms.approved_at,
               'versions', coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'id', v.id, 'version', v.version, 'link_url', v.link_url, 'note', v.note,
                          'submitted_by', app_private.project_name(v.submitted_by), 'submitted_at', v.submitted_at,
                          'decision', v.decision, 'decision_note', v.decision_note,
                          'decided_by', app_private.project_name(v.decided_by), 'decided_at', v.decided_at)
                        ORDER BY v.version DESC)
                 FROM public.production_milestone_versions v WHERE v.milestone_id = ms.id), '[]'::jsonb))
             ORDER BY ms.position, ms.created_at)
      FROM public.production_milestones ms WHERE ms.project_id = p.id), '[]'::jsonb));
END;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.create_production_project(uuid, text, text, text)',
    'public.update_production_project(uuid, text, text, text, text)',
    'public.set_project_team(uuid, jsonb)',
    'public.save_project_milestone(uuid, uuid, text, text, date)',
    'public.delete_project_milestone(uuid)',
    'public.submit_milestone_version(uuid, text, text)',
    'public.review_milestone_version(uuid, boolean, text)',
    'public.my_production_projects()',
    'public.production_project_detail(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION app_private.mentors_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.on_project_team(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.can_view_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.mentors_project(uuid), app_private.on_project_team(uuid),
  app_private.can_view_project(uuid) TO authenticated;
REVOKE ALL ON FUNCTION app_private.require_project_mentor(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.project_name(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.notify_project_team(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

-- New notification type (always delivered).
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
    'project_update',
    'role_changed',
    'system_message'
  )
);
