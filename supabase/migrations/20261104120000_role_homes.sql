-- =============================================================================
-- Role homes: one call each for the tutor and learner home pages.
--
-- my_tutor_home()   what needs the tutor (marking queue, join requests,
--                   sessions without a register), their classes, and their
--                   own delivery figures: the same row their school admin
--                   sees in school_tutor_metrics.
-- my_learner_home() what needs the learner (revisions, peer reviews, missed
--                   work), what's coming up, their latest feedback and new
--                   materials in their classes.
--
-- Both read only the caller's own classes, so they need no role check.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.my_tutor_home()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inst uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '42501';
  END IF;
  SELECT institution_id INTO v_inst FROM public.users WHERE id = v_uid;

  WITH cls AS (
    SELECT c.id, c.name, c.code, c.programme_id
    FROM public.classes c
    WHERE c.teacher_id = v_uid AND c.status = 'active'
  ),
  waiting AS (
    SELECT s.id, s.student_id, s.submitted_at, s.revision_count,
           a.id AS assignment_id, a.title, c.name AS class_name
    FROM public.submissions s
    JOIN public.assignments a ON a.id = s.assignment_id
    JOIN cls c ON c.id = a.class_id
    WHERE s.status = 'submitted'
  )
  SELECT jsonb_build_object(
    'programmes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'stage', p.stage) ORDER BY p.name)
      FROM public.programmes p
      WHERE p.status = 'active' AND p.id IN (SELECT programme_id FROM cls)
    ), '[]'::jsonb),
    'to_mark', (SELECT count(*) FROM waiting),
    'oldest_waiting', (SELECT min(submitted_at) FROM waiting),
    'queue', coalesce((
      SELECT jsonb_agg(q ORDER BY q->>'submitted_at')
      FROM (
        SELECT jsonb_build_object(
          'submission_id', w.id,
          'learner', app_private.person_name(w.student_id),
          'assignment_id', w.assignment_id,
          'assignment', w.title,
          'class_name', w.class_name,
          'round', w.revision_count + 1,
          'submitted_at', w.submitted_at
        ) AS q
        FROM waiting w
        ORDER BY w.submitted_at NULLS LAST
        LIMIT 6
      ) x
    ), '[]'::jsonb),
    'join_requests', coalesce((
      SELECT jsonb_agg(jsonb_build_object('class_id', c.id, 'class_name', c.name, 'count', n) ORDER BY c.name)
      FROM (
        SELECT e.class_id, count(*) AS n
        FROM public.enrollments e
        WHERE e.status = 'pending' AND e.class_id IN (SELECT id FROM cls)
        GROUP BY e.class_id
      ) r
      JOIN cls c ON c.id = r.class_id
    ), '[]'::jsonb),
    -- Sessions logged in the last week with nobody marked.
    'unregistered_sessions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'session_id', s.id, 'class_id', c.id, 'class_name', c.name,
        'topic', s.topic, 'held_on', s.held_on) ORDER BY s.held_on DESC)
      FROM public.class_sessions s
      JOIN cls c ON c.id = s.class_id
      WHERE s.held_on BETWEEN current_date - 7 AND current_date
        AND NOT EXISTS (SELECT 1 FROM public.session_attendance a WHERE a.session_id = s.id)
    ), '[]'::jsonb),
    'classes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'code', c.code,
        'learners', (SELECT count(*) FROM public.enrollments e
                     WHERE e.class_id = c.id AND e.status IN ('enrolled', 'active')),
        'next_due', (SELECT jsonb_build_object('title', a.title, 'due_date', a.due_date)
                     FROM public.assignments a
                     WHERE a.class_id = c.id AND a.status = 'published' AND a.due_date >= now()
                     ORDER BY a.due_date LIMIT 1),
        'last_session', (SELECT max(s.held_on) FROM public.class_sessions s WHERE s.class_id = c.id)
      ) ORDER BY c.name)
      FROM cls c
    ), '[]'::jsonb),
    'delivery', (
      SELECT jsonb_build_object(
        'sessions_30d', d.sessions_30d,
        'attendance_rate', d.attendance_rate,
        'avg_turnaround_hours', d.avg_turnaround_hours,
        'feedback_rate', d.feedback_rate,
        'graded', d.graded,
        'overdue_reviews', d.overdue_reviews,
        'flags', to_jsonb(d.flags))
      FROM app_private.tutor_delivery(v_inst) d
      WHERE d.teacher_id = v_uid
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_learner_home()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '42501';
  END IF;

  WITH cls AS (
    SELECT c.id, c.name, c.programme_id
    FROM public.enrollments e
    JOIN public.classes c ON c.id = e.class_id
    WHERE e.student_id = v_uid AND e.status IN ('enrolled', 'active')
  ),
  work AS (
    SELECT a.id, a.title, a.due_date, a.points_possible, c.name AS class_name,
           s.status AS submission_status
    FROM public.assignments a
    JOIN cls c ON c.id = a.class_id
    LEFT JOIN public.submissions s ON s.assignment_id = a.id AND s.student_id = v_uid
    WHERE a.status = 'published'
  )
  SELECT jsonb_build_object(
    'stage', app_private.learner_stage(v_uid),
    'programmes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'stage', p.stage) ORDER BY p.name)
      FROM public.programmes p
      WHERE p.status = 'active' AND p.id IN (SELECT programme_id FROM cls)
    ), '[]'::jsonb),
    'class_count', (SELECT count(*) FROM cls),
    'revisions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'assignment_id', a.id, 'title', a.title, 'class_name', c.name,
        'feedback', left(s.feedback, 200), 'due_date', a.due_date,
        'requested_at', s.revision_requested_at) ORDER BY s.revision_requested_at)
      FROM public.submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      JOIN cls c ON c.id = a.class_id
      WHERE s.student_id = v_uid AND s.status = 'revision_requested'
    ), '[]'::jsonb),
    'peer_reviews', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'peer_review_assignment_id', pra.id, 'title', pra.title,
        'count', n, 'first_review_id', first_id, 'end_date', pra.end_date,
        'anonymous', pra.review_type <> 'named') ORDER BY pra.end_date NULLS LAST)
      FROM (
        SELECT pr.peer_review_assignment_id, count(*) AS n,
               (array_agg(pr.id ORDER BY pr.created_at))[1] AS first_id
        FROM public.peer_reviews pr
        WHERE pr.reviewer_id = v_uid AND pr.status IN ('pending', 'in_progress')
        GROUP BY pr.peer_review_assignment_id
      ) r
      JOIN public.peer_review_assignments pra ON pra.id = r.peer_review_assignment_id
      WHERE pra.status = 'active' AND pra.class_id IN (SELECT id FROM cls)
    ), '[]'::jsonb),
    -- Missed in the last two weeks and not handed in: still worth doing.
    'missed', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'assignment_id', w.id, 'title', w.title, 'class_name', w.class_name,
        'due_date', w.due_date) ORDER BY w.due_date DESC)
      FROM work w
      WHERE w.due_date < now() AND w.due_date >= now() - interval '14 days'
        AND coalesce(w.submission_status, 'draft') = 'draft'
    ), '[]'::jsonb),
    'coming_up', coalesce((
      SELECT jsonb_agg(u ORDER BY u->>'due_date')
      FROM (
        SELECT jsonb_build_object(
          'assignment_id', w.id, 'title', w.title, 'class_name', w.class_name,
          'due_date', w.due_date, 'started', w.submission_status = 'draft') AS u
        FROM work w
        WHERE w.due_date >= now() AND coalesce(w.submission_status, 'draft') = 'draft'
        ORDER BY w.due_date
        LIMIT 5
      ) x
    ), '[]'::jsonb),
    'latest_feedback', (
      SELECT jsonb_build_object(
        'assignment_id', a.id, 'title', a.title, 'grade', s.grade,
        'points_possible', a.points_possible, 'feedback', left(s.feedback, 300),
        'marked_by', app_private.person_name(s.graded_by), 'graded_at', s.graded_at)
      FROM public.submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      JOIN cls c ON c.id = a.class_id
      WHERE s.student_id = v_uid AND s.status = 'graded'
      ORDER BY s.graded_at DESC NULLS LAST
      LIMIT 1
    ),
    'new_materials', coalesce((
      SELECT jsonb_agg(m ORDER BY m->>'created_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', cm.id, 'title', cm.title, 'kind', cm.kind, 'file_size', cm.file_size,
          'class_id', c.id, 'class_name', c.name, 'created_at', cm.created_at) AS m
        FROM public.class_materials cm
        JOIN cls c ON c.id = cm.class_id
        WHERE cm.created_at >= now() - interval '14 days'
        ORDER BY cm.created_at DESC
        LIMIT 4
      ) x
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.my_tutor_home() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_learner_home() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_tutor_home() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_learner_home() TO authenticated;

COMMIT;
