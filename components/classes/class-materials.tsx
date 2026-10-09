'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Paperclip,
  PlayCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import { confirmAction, errorMessage, toast } from '@/lib/toast';
import {
  ALLOWED_MATERIAL_TYPES,
  ClassMaterial,
  MATERIALS_BUCKET,
  MATERIAL_ACCEPT,
  MAX_MATERIAL_BYTES,
  fileProblem,
  formatBytes,
  isVideoLink,
  materialPath,
  normalizeLink,
} from '@/lib/materials';

interface ClassMaterialsProps {
  classId: string;
  /** The class's teacher: can add and remove materials. */
  canManage: boolean;
}

/** Files and links shared with a class. Teachers manage; students view. */
export function ClassMaterials({ classId, canManage }: ClassMaterialsProps) {
  const [materials, setMaterials] = useState<ClassMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await createClient()
      .from('class_materials')
      .select(
        'id, class_id, title, description, kind, url, file_path, file_name, file_size, mime_type, created_at'
      )
      .eq('class_id', classId)
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError(errorMessage(error, 'Could not load materials'));
    } else {
      setMaterials((data as ClassMaterial[]) ?? []);
    }
    setLoading(false);
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  const open = async (material: ClassMaterial) => {
    if (material.kind === 'link' && material.url) {
      window.open(material.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!material.file_path) return;
    // Open the tab now (popup blockers allow it during the click), then
    // point it at the signed URL once we have one.
    const tab = window.open('', '_blank');
    const { data, error } = await createClient()
      .storage.from(MATERIALS_BUCKET)
      .createSignedUrl(material.file_path, 60);
    if (error || !data?.signedUrl) {
      tab?.close();
      toast.error(errorMessage(error, 'Could not open the file'));
      return;
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = data.signedUrl;
    } else {
      window.location.href = data.signedUrl;
    }
  };

  const remove = async (material: ClassMaterial) => {
    const ok = await confirmAction({
      title: `Remove "${material.title}"?`,
      description: 'Students will no longer see it.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('class_materials')
      .delete()
      .eq('id', material.id);
    if (error) {
      toast.error(errorMessage(error, 'Could not remove it'));
      return;
    }
    if (material.file_path) {
      // The material is gone either way; a leftover file is only storage.
      await supabase.storage
        .from(MATERIALS_BUCKET)
        .remove([material.file_path]);
    }
    setMaterials(current => current.filter(m => m.id !== material.id));
    toast.success('Removed');
  };

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          {!adding && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add material
            </Button>
          )}
        </div>
      )}

      {canManage && adding && (
        <AddMaterialForm
          classId={classId}
          onCancel={() => setAdding(false)}
          onAdded={material => {
            setMaterials(current => [material, ...current]);
            setAdding(false);
          }}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        </div>
      ) : loadError ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            <p className="text-sm text-red-600">{loadError}</p>
            <Button variant="outline" size="sm" onClick={load}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : materials.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {canManage
              ? 'No materials yet. Add files, notes or links (including videos) for your students.'
              : 'Your teacher hasn’t shared any materials yet.'}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {materials.map(material => (
            <MaterialRow
              key={material.id}
              material={material}
              canManage={canManage}
              onOpen={() => open(material)}
              onRemove={() => remove(material)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MaterialRow({
  material,
  canManage,
  onOpen,
  onRemove,
}: {
  material: ClassMaterial;
  canManage: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const video = material.kind === 'link' && isVideoLink(material.url);
  const Icon =
    material.kind === 'file' ? FileText : video ? PlayCircle : LinkIcon;
  const detail =
    material.kind === 'file'
      ? [
          ALLOWED_MATERIAL_TYPES[material.mime_type ?? ''] ?? 'File',
          formatBytes(material.file_size),
        ]
          .filter(Boolean)
          .join(' · ')
      : video
        ? 'Video link'
        : linkHost(material.url);

  return (
    <li>
      <Card>
        <CardContent className="flex items-start gap-4 p-4">
          <Icon className="h-6 w-6 shrink-0 text-blue-600 mt-0.5" />
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onOpen}
              className="text-left font-medium hover:underline break-words"
            >
              {material.title}
            </button>
            {material.description && (
              <p className="mt-1 text-sm text-gray-600 whitespace-pre-line break-words">
                {material.description}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {detail} · Added{' '}
              {new Date(material.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onOpen}
              aria-label={`Open ${material.title}`}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemove}
                aria-label={`Remove ${material.title}`}
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function linkHost(link: string | null) {
  try {
    return link ? new URL(link).hostname.replace(/^www\./, '') : 'Link';
  } catch {
    return 'Link';
  }
}

function AddMaterialForm({
  classId,
  onAdded,
  onCancel,
}: {
  classId: string;
  onAdded: (material: ClassMaterial) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<'file' | 'link'>('file');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const chooseFile = (chosen: File | null) => {
    if (chosen) {
      const problem = fileProblem(chosen);
      if (problem) {
        toast.error(problem);
        if (fileInput.current) fileInput.current.value = '';
        setFile(null);
        return;
      }
      if (!title.trim()) setTitle(chosen.name.replace(/\.[^.]+$/, ''));
    }
    setFile(chosen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = title.trim();
    if (!name) {
      toast.error('Give it a title');
      return;
    }
    const supabase = createClient();
    const columns =
      'id, class_id, title, description, kind, url, file_path, file_name, file_size, mime_type, created_at';
    setSaving(true);
    try {
      if (kind === 'link') {
        const url = normalizeLink(link);
        if (!url) {
          toast.error('Enter a web address starting with http:// or https://');
          return;
        }
        const { data, error } = await supabase
          .from('class_materials')
          .insert({
            class_id: classId,
            title: name,
            description: description.trim() || null,
            kind: 'link',
            url,
          })
          .select(columns)
          .single();
        if (error) throw error;
        onAdded(data as ClassMaterial);
      } else {
        if (!file) {
          toast.error('Choose a file');
          return;
        }
        const path = materialPath(classId, file.name, crypto.randomUUID());
        const upload = await supabase.storage
          .from(MATERIALS_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upload.error) throw upload.error;
        const { data, error } = await supabase
          .from('class_materials')
          .insert({
            class_id: classId,
            title: name,
            description: description.trim() || null,
            kind: 'file',
            file_path: path,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
          })
          .select(columns)
          .single();
        if (error) {
          // Don't leave an orphaned upload behind.
          await supabase.storage.from(MATERIALS_BUCKET).remove([path]);
          throw error;
        }
        onAdded(data as ClassMaterial);
      }
      toast.success('Material added');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not add the material'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add material</CardTitle>
        <CardDescription>
          Upload a file (up to {formatBytes(MAX_MATERIAL_BYTES)}) or share a
          link. For videos, paste a YouTube, Vimeo or Drive link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
          <div className="flex gap-2" role="group" aria-label="Material type">
            <Button
              type="button"
              variant={kind === 'file' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setKind('file')}
              aria-pressed={kind === 'file'}
            >
              <Paperclip className="h-4 w-4 mr-2" />
              File
            </Button>
            <Button
              type="button"
              variant={kind === 'link' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setKind('link')}
              aria-pressed={kind === 'link'}
            >
              <LinkIcon className="h-4 w-4 mr-2" />
              Link or video
            </Button>
          </div>

          {kind === 'file' ? (
            <div className="space-y-2">
              <Label htmlFor="material-file">File</Label>
              <Input
                id="material-file"
                ref={fileInput}
                type="file"
                accept={MATERIAL_ACCEPT}
                onChange={e => chooseFile(e.target.files?.[0] ?? null)}
              />
              {file && (
                <p className="text-xs text-muted-foreground">
                  {file.name} · {formatBytes(file.size)}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="material-link">Link</Label>
              <Input
                id="material-link"
                type="text"
                inputMode="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={link}
                onChange={e => setLink(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="material-title">Title</Label>
            <Input
              id="material-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={200}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="material-description">
              Description{' '}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="material-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving
                ? kind === 'file'
                  ? 'Uploading...'
                  : 'Saving...'
                : 'Add'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
