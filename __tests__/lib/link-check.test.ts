import { checkUrl, interpret, linkService } from '@/lib/link-check';

describe('linkService', () => {
  it.each([
    ['https://youtu.be/abc', 'youtube'],
    ['https://www.youtube.com/watch?v=abc', 'youtube'],
    ['https://m.youtube.com/watch?v=abc', 'youtube'],
    ['https://vimeo.com/123', 'vimeo'],
    ['https://drive.google.com/file/d/xyz/view', 'google_drive'],
    ['https://docs.google.com/presentation/d/xyz', 'google_drive'],
    ['https://example.com/video.mp4', null],
    ['https://youtube.com.evil.test/x', null],
    ['not a url', null],
  ])('%s -> %s', (link, service) => {
    expect(linkService(link)).toBe(service);
  });
});

describe('checkUrl', () => {
  it('asks YouTube and Vimeo through their oEmbed endpoints', () => {
    expect(checkUrl('https://youtu.be/abc')).toBe(
      'https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fyoutu.be%2Fabc'
    );
    expect(checkUrl('https://vimeo.com/123')).toBe(
      'https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F123'
    );
  });

  it('rebuilds Drive links on Google’s own host', () => {
    expect(
      checkUrl('https://drive.google.com/file/d/xyz/view?usp=sharing')
    ).toBe('https://drive.google.com/file/d/xyz/view?usp=sharing');
  });

  it('never fetches other sites', () => {
    expect(checkUrl('http://169.254.169.254/latest/meta-data')).toBeNull();
    expect(checkUrl('https://internal.example/admin')).toBeNull();
  });
});

describe('interpret', () => {
  it('reads YouTube/Vimeo answers', () => {
    expect(interpret('youtube', { status: 200, finalUrl: '' }).status).toBe(
      'ok'
    );
    expect(interpret('youtube', { status: 401, finalUrl: '' })).toMatchObject({
      status: 'private',
      message: expect.stringMatching(/Unlisted/),
    });
    expect(interpret('vimeo', { status: 404, finalUrl: '' }).status).toBe(
      'missing'
    );
    expect(interpret('vimeo', { status: 500, finalUrl: '' }).status).toBe(
      'unknown'
    );
  });

  it('spots Drive files that bounce to Google sign-in', () => {
    expect(
      interpret('google_drive', {
        status: 200,
        finalUrl: 'https://accounts.google.com/ServiceLogin?continue=...',
      })
    ).toMatchObject({
      status: 'private',
      message: expect.stringMatching(/Anyone with the link/),
    });
    expect(
      interpret('google_drive', {
        status: 200,
        finalUrl: 'https://drive.google.com/file/d/xyz/view',
      }).status
    ).toBe('ok');
  });
});
