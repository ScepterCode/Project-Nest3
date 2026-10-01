-- Let students see who else is in their class.
--
-- RLS lets a student read only their own enrollment and their own users row,
-- so the classmates tab was always empty. Rather than widening those
-- policies (which would expose emails, roles and every other column), this
-- function returns just names and enrollment dates, and only for a class the
-- caller is enrolled in or teaches.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_class_roster(p_class uuid)
RETURNS TABLE (
  student_id uuid,
  first_name text,
  last_name text,
  enrolled_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.student_id, u.first_name::text, u.last_name::text, e.enrolled_at
  FROM public.enrollments e
  JOIN public.users u ON u.id = e.student_id
  WHERE e.class_id = p_class
    AND e.status IN ('enrolled', 'active')
    AND (app_private.is_enrolled_in(p_class) OR app_private.teaches_class(p_class))
  ORDER BY u.last_name NULLS LAST, u.first_name NULLS LAST
$$;

REVOKE ALL ON FUNCTION public.get_class_roster(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_roster(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
