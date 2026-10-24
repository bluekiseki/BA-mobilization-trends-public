import { describe, expect, it } from 'vitest';
import { handleTextFeed, isTextFeedPath } from './textFeedGuard';

const env = {} as Env; // no rate limit binding: fails open
const get = (path: string) => handleTextFeed(new Request(`https://example.test${path}`), env);

describe('isTextFeedPath', () => {
  it('matches only feed prefixes', () => {
    expect(isTextFeedPath('/txt/ko/students.txt')).toBe(true);
    expect(isTextFeedPath('/api/text/notices')).toBe(true);
    expect(isTextFeedPath('/api/notices')).toBe(false);
    expect(isTextFeedPath('/llms.txt')).toBe(false); // served as a static file
  });
});

describe('handleTextFeed', () => {
  it('answers static feed misses with a plain-text 404', async () => {
    const res = await get('/txt/ko/students/99999.txt');
    expect(res?.status).toBe(404);
    expect(res?.headers.get('Content-Type')).toContain('text/plain');
  });

  it('lets canonical notices requests through to the app', async () => {
    expect(await get('/api/text/notices')).toBeNull();
    expect(await get('/api/text/notices?region=JP')).toBeNull();
  });

  it('redirects non-canonical notices queries and rejects bad regions', async () => {
    const redirect = await get('/api/text/notices?region=JP&x=1');
    expect(redirect?.status).toBe(301);
    expect(redirect?.headers.get('Location')).toBe('https://example.test/api/text/notices?region=JP');
    expect((await get('/api/text/notices?region=XX'))?.status).toBe(400);
  });
});
