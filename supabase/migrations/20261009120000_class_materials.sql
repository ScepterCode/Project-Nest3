-- =============================================================================
-- Class materials: files and links a teacher shares with their class
-- =============================================================================
-- A material is either an uploaded file (in the private "class-materials"
-- bucket, at "<class_id>/<random>/<file name>") or a link (web page, video,
-- shared drive). The class's teacher adds, edits and removes them; enrolled
-- students and the institution's admins can view them. Files are opened
-- through short-lived signed URLs, so a link only works for someone who can
-- read the storage object.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.class_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes (id) ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description text CHECK (description IS NULL OR length(description) <= 2000),
  kind text NOT NULL CHECK (kind IN ('file', 'link')),
  url text CHECK (url IS NULL OR (url ~* '^https?://[^\s]+$' AND length(url) <= 2000)),
  file_path text,
  file_name text,
  file_size bigint CHECK (file_size IS NULL OR file_size >= 0),
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_materials_kind_fields CHECK (
    (kind = 'link' AND url IS NOT NULL AND file_path IS NULL)
    OR (kind = 'file' AND file_path IS NOT NULL AND url IS NULL)
  ),
  -- Files must live in this class's folder.
  CONSTRAINT class_materials_file_in_class_folder CHECK (
    file_path IS NULL OR split_part(file_path, '/', 1) = class_id::text
  )
);

CREATE INDEX IF NOT EXISTS class_materials_class_created_idx
  ON public.class_materials (class_id, created_at DESC);

ALTER TABLE public.class_materials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.class_materials FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_materials TO authenticated;

DROP POLICY IF EXISTS class_materials_select ON public.class_materials;
CREATE POLICY class_materials_select ON public.class_materials
  FOR SELECT TO authenticated
  USING (
    class_id IN (SELECT app_private.my_taught_class_ids())
    OR class_id IN (SELECT app_private.my_enrolled_class_ids())
    OR class_id IN (SELECT app_private.my_admin_class_ids())
  );

DROP POLICY IF EXISTS class_materials_insert ON public.class_materials;
CREATE POLICY class_materials_insert ON public.class_materials
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND app_private.teaches_class(class_id)
  );

DROP POLICY IF EXISTS class_materials_update ON public.class_materials;
CREATE POLICY class_materials_update ON public.class_materials
  FOR UPDATE TO authenticated
  USING (app_private.teaches_class(class_id))
  WITH CHECK (app_private.teaches_class(class_id));

DROP POLICY IF EXISTS class_materials_delete ON public.class_materials;
CREATE POLICY class_materials_delete ON public.class_materials
  FOR DELETE TO authenticated
  USING (app_private.teaches_class(class_id));

-- A material can't be moved to another class or have its file swapped for
-- one elsewhere; only its title, description and link change.
CREATE OR REPLACE FUNCTION app_private.guard_class_material_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.class_id IS DISTINCT FROM OLD.class_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.file_path IS DISTINCT FROM OLD.file_path THEN
    RAISE EXCEPTION 'Only the title, description and link of a material can be changed'
      USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_class_material_update ON public.class_materials;
CREATE TRIGGER guard_class_material_update
  BEFORE UPDATE ON public.class_materials
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_class_material_update();

-- -----------------------------------------------------------------------------
-- Storage
-- -----------------------------------------------------------------------------
-- 50 MB is the free plan's per-file maximum. No HTML, SVG or scripts: signed
-- URLs serve files inline, and those types could run code when opened.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'class-materials', 'class-materials', false, 52428800,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.presentation',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/rtf',
    'application/zip',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- The class id from a "<class_id>/..." path, or NULL if it isn't one.
CREATE OR REPLACE FUNCTION app_private.material_path_class(p_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  v_folder text := split_part(p_name, '/', 1);
BEGIN
  IF v_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  RETURN v_folder::uuid;
END;
$$;
GRANT EXECUTE ON FUNCTION app_private.material_path_class(text) TO authenticated;

DROP POLICY IF EXISTS "Teachers upload class materials" ON storage.objects;
CREATE POLICY "Teachers upload class materials" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'class-materials'
    AND app_private.teaches_class(app_private.material_path_class(name))
  );

DROP POLICY IF EXISTS "Class members view class materials" ON storage.objects;
CREATE POLICY "Class members view class materials" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'class-materials'
    AND (
      app_private.teaches_class(app_private.material_path_class(name))
      OR app_private.is_enrolled_in(app_private.material_path_class(name))
      OR app_private.administers_class(app_private.material_path_class(name))
    )
  );

DROP POLICY IF EXISTS "Teachers delete class materials" ON storage.objects;
CREATE POLICY "Teachers delete class materials" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'class-materials'
    AND app_private.teaches_class(app_private.material_path_class(name))
  );

-- -----------------------------------------------------------------------------
-- Notify the class's students when a material is added
-- -----------------------------------------------------------------------------
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
         '/dashboard/student/classes/' || c.id,
         'Open class',
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

NOTIFY pgrst, 'reload schema';

COMMIT;
