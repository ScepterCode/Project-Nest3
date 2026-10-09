-- =============================================================================
-- Notify a class's students when their teacher adds a material
-- =============================================================================
-- Was meant to ship in 20261009120000_class_materials.sql but missed the
-- merge. Safe to run whether or not that earlier copy was applied: the
-- function is replaced and the trigger recreated.
-- =============================================================================

BEGIN;

-- Runs in the database so every new material notifies every enrolled student,
-- whichever way it was added. Students who turned off announcement
-- notifications are skipped.
CREATE OR REPLACE FUNCTION app_private.notify_class_material()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, action_url, action_label, metadata)
  SELECT e.student_id,
         'class_announcement',
         left('New material in ' || c.name, 255),
         NEW.title,
         'medium',
         '/dashboard/student/classes/' || c.id || '?tab=materials',
         'View materials',
         jsonb_build_object('class_id', c.id, 'material_id', NEW.id)
  FROM public.enrollments e
  JOIN public.classes c ON c.id = e.class_id
  LEFT JOIN public.notification_preferences p ON p.user_id = e.student_id
  WHERE e.class_id = NEW.class_id
    AND e.status IN ('enrolled', 'active')
    AND coalesce(p.announcement_notifications, true);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.notify_class_material() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_class_material ON public.class_materials;
CREATE TRIGGER notify_class_material
  AFTER INSERT ON public.class_materials
  FOR EACH ROW EXECUTE FUNCTION app_private.notify_class_material();


COMMIT;
