const upload = jest.fn();
const tusInstances: {
  options: Record<string, (...a: unknown[]) => void>;
  started: boolean;
  resumed: unknown;
}[] = [];

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: { from: () => ({ upload }) },
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'token' } },
      }),
    },
  }),
}));

jest.mock('tus-js-client', () => ({
  Upload: class {
    options: Record<string, (...a: unknown[]) => void>;
    started = false;
    resumed: unknown = null;
    constructor(
      _file: unknown,
      options: Record<string, (...a: unknown[]) => void>
    ) {
      this.options = options;
      tusInstances.push(this);
    }
    findPreviousUploads() {
      return Promise.resolve([{ metadata: { objectName: 'u/a/big.mp4' } }]);
    }
    resumeFromPreviousUpload(previous: unknown) {
      this.resumed = previous;
    }
    start() {
      this.started = true;
      this.options.onProgress(3, 6);
      this.options.onSuccess();
    }
  },
}));

// Imported after the mocks.
import {
  RESUMABLE_FROM_BYTES,
  uploadFile,
} from '@/lib/storage/resumable-upload';

const fakeFile = (size: number) => ({ size, name: 'f' }) as unknown as File;

beforeEach(() => {
  upload.mockReset();
  tusInstances.length = 0;
});

it('uses a normal upload for small files', async () => {
  upload.mockResolvedValue({ error: null });
  const progress = jest.fn();
  await uploadFile({
    bucket: 'submissions',
    path: 'u/a/small.png',
    file: fakeFile(1000),
    contentType: 'image/png',
    onProgress: progress,
  });
  expect(upload).toHaveBeenCalledWith('u/a/small.png', expect.anything(), {
    contentType: 'image/png',
    upsert: false,
  });
  expect(progress).toHaveBeenCalledWith(1);
  expect(tusInstances).toHaveLength(0);
});

it('treats "already exists" as done (same file, stable path)', async () => {
  upload.mockResolvedValue({
    error: { statusCode: '409', message: 'The resource already exists' },
  });
  await expect(
    uploadFile({
      bucket: 'submissions',
      path: 'u/a/small.png',
      file: fakeFile(1000),
      contentType: 'image/png',
    })
  ).resolves.toBeUndefined();
});

it('still reports other upload errors', async () => {
  upload.mockResolvedValue({
    error: {
      statusCode: '403',
      message: 'new row violates row-level security policy',
    },
  });
  await expect(
    uploadFile({
      bucket: 'submissions',
      path: 'u/a/small.png',
      file: fakeFile(1000),
      contentType: 'image/png',
    })
  ).rejects.toMatchObject({
    message: expect.stringMatching(/row-level security/),
  });
});

it('sends large files in resumable 6 MB chunks and resumes an earlier attempt', async () => {
  const progress = jest.fn();
  await uploadFile({
    bucket: 'submissions',
    path: 'u/a/big.mp4',
    file: fakeFile(RESUMABLE_FROM_BYTES + 1),
    contentType: 'video/mp4',
    onProgress: progress,
  });
  const [instance] = tusInstances;
  expect(instance.started).toBe(true);
  expect(instance.resumed).toEqual({ metadata: { objectName: 'u/a/big.mp4' } });
  expect(instance.options).toMatchObject({
    chunkSize: 6 * 1024 * 1024,
    metadata: {
      bucketName: 'submissions',
      objectName: 'u/a/big.mp4',
      contentType: 'video/mp4',
    },
    headers: { authorization: 'Bearer token', 'x-upsert': 'false' },
  });
  expect(progress).toHaveBeenCalledWith(0.5);
  expect(upload).not.toHaveBeenCalled();
});
