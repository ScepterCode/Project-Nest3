import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClassMaterials } from '@/components/classes/class-materials';
import { ClassMaterial } from '@/lib/materials';

const material = (over: Partial<ClassMaterial>): ClassMaterial => ({
  id: 'm1',
  class_id: 'c1',
  title: 'Week 1 notes',
  description: null,
  kind: 'file',
  url: null,
  file_path: 'c1/r1/notes.pdf',
  file_name: 'notes.pdf',
  file_size: 2048,
  mime_type: 'application/pdf',
  created_at: '2026-10-01T10:00:00Z',
  ...over,
});

let rows: ClassMaterial[] = [];
const inserted: Record<string, unknown>[] = [];
const deleted: string[] = [];
const removedFiles: string[][] = [];
const uploads: string[] = [];

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: rows, error: null }),
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return {
          select: () => ({
            single: async () => ({
              data: { id: 'new', created_at: '2026-10-09T10:00:00Z', ...row },
              error: null,
            }),
          }),
        };
      },
      delete: () => ({
        eq: async (_col: string, id: string) => {
          deleted.push(id);
          return { error: null };
        },
      }),
    }),
    storage: {
      from: () => ({
        upload: async (path: string) => {
          uploads.push(path);
          return { data: { path }, error: null };
        },
        remove: async (paths: string[]) => {
          removedFiles.push(paths);
          return { error: null };
        },
        createSignedUrl: async () => ({
          data: { signedUrl: 'https://signed.test/x' },
          error: null,
        }),
      }),
    },
  }),
}));

jest.mock('@/lib/toast', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
  confirmAction: jest.fn(async () => true),
  errorMessage: (e: unknown, fallback: string) =>
    e instanceof Error ? e.message : fallback,
}));

beforeEach(() => {
  rows = [];
  inserted.length = 0;
  deleted.length = 0;
  removedFiles.length = 0;
  uploads.length = 0;
});

it('shows students the materials, without add or remove buttons', async () => {
  rows = [
    material({}),
    material({
      id: 'm2',
      title: 'Cell video',
      kind: 'link',
      url: 'https://www.youtube.com/watch?v=1',
      file_path: null,
      file_name: null,
      file_size: null,
      mime_type: null,
    }),
  ];
  render(<ClassMaterials classId="c1" canManage={false} />);

  expect(await screen.findByText('Week 1 notes')).toBeInTheDocument();
  expect(screen.getByText(/PDF · 2 KB/)).toBeInTheDocument();
  expect(screen.getByText('Cell video')).toBeInTheDocument();
  expect(screen.getByText(/Video link/)).toBeInTheDocument();
  expect(screen.queryByText('Add material')).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Remove/)).not.toBeInTheDocument();
});

it('tells students when there is nothing yet', async () => {
  render(<ClassMaterials classId="c1" canManage={false} />);
  expect(
    await screen.findByText(/hasn’t shared any materials yet/)
  ).toBeInTheDocument();
});

it('lets a teacher add a link, normalising the address', async () => {
  render(<ClassMaterials classId="c1" canManage />);
  fireEvent.click(await screen.findByText('Add material'));
  fireEvent.click(screen.getByText('Link or video'));
  fireEvent.change(screen.getByLabelText('Link'), {
    target: { value: 'youtu.be/abc' },
  });
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Intro video' },
  });
  fireEvent.click(screen.getByText('Add'));

  expect(await screen.findByText('Intro video')).toBeInTheDocument();
  expect(inserted[0]).toMatchObject({
    class_id: 'c1',
    kind: 'link',
    url: 'https://youtu.be/abc',
    title: 'Intro video',
  });
});

it('uploads a file into the class folder before recording it', async () => {
  render(<ClassMaterials classId="c1" canManage />);
  fireEvent.click(await screen.findByText('Add material'));
  const file = new File(['%PDF'], 'Week 2.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText('File'), {
    target: { files: [file] },
  });
  // Title defaults to the file name.
  expect(screen.getByLabelText('Title')).toHaveValue('Week 2');
  fireEvent.click(screen.getByText('Add'));

  await waitFor(() => expect(inserted).toHaveLength(1));
  expect(uploads[0]).toMatch(/^c1\/[\w-]+\/Week_2\.pdf$/);
  expect(inserted[0]).toMatchObject({
    kind: 'file',
    file_path: uploads[0],
    file_name: 'Week 2.pdf',
    mime_type: 'application/pdf',
  });
});

it('refuses unsupported files before uploading', async () => {
  const { toast } = jest.requireMock('@/lib/toast');
  render(<ClassMaterials classId="c1" canManage />);
  fireEvent.click(await screen.findByText('Add material'));
  const file = new File(['<script>'], 'page.html', { type: 'text/html' });
  fireEvent.change(screen.getByLabelText('File'), {
    target: { files: [file] },
  });
  expect(toast.error).toHaveBeenCalledWith(
    expect.stringMatching(/isn’t supported/)
  );
  expect(uploads).toHaveLength(0);
});

it('removes a material and its file', async () => {
  rows = [material({})];
  render(<ClassMaterials classId="c1" canManage />);
  fireEvent.click(await screen.findByLabelText('Remove Week 1 notes'));

  await waitFor(() =>
    expect(screen.queryByText('Week 1 notes')).not.toBeInTheDocument()
  );
  expect(deleted).toEqual(['m1']);
  expect(removedFiles).toEqual([['c1/r1/notes.pdf']]);
});
