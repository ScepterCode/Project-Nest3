-- Production projects: what the pages need but couldn't read themselves.
--
-- * project_groups(): the mentorship/fellowship groups the caller can start
--   a project in. Mentors get the groups they teach; platform admins (aal2)
--   get every group. The page used to query classes directly, which RLS
--   limits to the caller's own classes, so platform admins saw none.
-- * project_team_candidates(p_project): the learners in a project's group,
--   for the mentor or a platform admin picking the team. The page used to
--   read enrollments directly (hidden from platform admins by RLS) and embed
--   names through a relationship PostgREST can't resolve.
-- * my_project_access(): what the Projects page should offer the caller
--   (start projects, follow learners' projects, …) to explain empty states.

CREATE OR REPLACE FUNCTION public.project_groups()
RETURNS TABLE (
  id uuid, name text, cohort_stage text, mentor_id uuid, mentor_name text,
  students bigint, projects bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.id, c.name::text, c.cohort_stage, c.teacher_id,
         app_private.project_name(c.teacher_id),
         (SELECT count(*) FROM public.enrollments e
           WHERE e.class_id = c.id AND e.status IN ('enrolled', 'active')),
         (SELECT count(*) FROM public.production_projects p WHERE p.class_id = c.id)
  FROM public.classes c
  WHERE c.cohort_stage IS NOT NULL
    AND coalesce(c.status, 'active') <> 'archived'
    AND (c.teacher_id = auth.uid() OR app_private.is_platform_admin())
  ORDER BY c.name;
$$;

CREATE OR REPLACE FUNCTION public.project_team_candidates(p_project uuid)
RETURNS TABLE (id uuid, name text, email text, school_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_project_mentor(p_project);
  RETURN QUERY
  SELECT u.id, app_private.project_name(u.id), u.email::text, i.name::text
  FROM public.production_projects p
  JOIN public.enrollments e ON e.class_id = p.class_id AND e.status IN ('enrolled', 'active')
  JOIN public.users u ON u.id = e.student_id
  LEFT JOIN public.institutions i ON i.id = u.institution_id
  WHERE p.id = p_project
  ORDER BY 2;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_project_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'role', u.role,
    'is_mentor', coalesce(u.is_programme_mentor, false),
    'platform_admin', app_private.is_platform_admin(),
    'stage', CASE WHEN u.role = 'student' THEN app_private.learner_stage(u.id) END,
    'groups', (SELECT count(*) FROM public.classes c
               WHERE c.cohort_stage IS NOT NULL
                 AND (c.teacher_id = u.id OR app_private.is_platform_admin()))
  )
  FROM public.users u WHERE u.id = auth.uid();
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.project_groups()',
    'public.project_team_candidates(uuid)',
    'public.my_project_access()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
