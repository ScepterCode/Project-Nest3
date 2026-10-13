import {
  MAX_SUBMISSION_BYTES,
  SUBMISSION_ACCEPT,
  submissionFileType,
} from '@/lib/submissions';

const file = (name: string, type: string, size = 1024) => ({
  name,
  type,
  size,
});

describe('submissionFileType', () => {
  it.each([
    ['walk-cycle.mp4', 'video/mp4'],
    ['scene.mov', 'video/quicktime'],
    ['loop.gif', 'image/gif'],
    ['storyboard.pdf', 'application/pdf'],
    ['frames.zip', 'application/x-zip-compressed'],
  ])('accepts %s as %s', (name, type) => {
    expect(submissionFileType(file(name, type))).toEqual({ contentType: type });
  });

  it.each([
    ['character.blend', ''],
    ['shot01.aep', 'application/octet-stream'],
    ['paint.psd', 'image/vnd.adobe.photoshop'],
    ['anim.fla', ''],
  ])('stores project file %s as a download', (name, type) => {
    expect(submissionFileType(file(name, type))).toEqual({
      contentType: 'application/octet-stream',
    });
  });

  it.each([
    ['page.html', 'text/html'],
    ['logo.svg', 'image/svg+xml'],
    ['run.exe', 'application/x-msdownload'],
    ['noext', ''],
  ])('refuses %s', (name, type) => {
    expect(submissionFileType(file(name, type))).toEqual({
      problem: expect.stringMatching(/isn’t supported/),
    });
  });

  it('refuses files over 50 MB and suggests a link', () => {
    expect(
      submissionFileType(
        file('long.mp4', 'video/mp4', MAX_SUBMISSION_BYTES + 1)
      )
    ).toEqual({ problem: expect.stringMatching(/50 MB.*link/) });
  });

  it('offers animation files in the picker', () => {
    for (const ext of ['.mp4', '.mov', '.gif', '.blend', '.zip']) {
      expect(SUBMISSION_ACCEPT.split(',')).toContain(ext);
    }
  });
});
