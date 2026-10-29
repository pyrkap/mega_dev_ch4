import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '',
};

async function withNight(contents: string, run: (runsDir: string) => Promise<void>) {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  writeFileSync(join(runsDir, 'night.jsonl'), contents);

  try {
    await run(runsDir);
  } finally {
    rmSync(runsDir, { recursive: true, force: true });
  }
}

const record = (job: string, status: 'ok' | 'retry' | 'fail', at: string) =>
  JSON.stringify({ at, job, status, owner: 'rook' });

describe('digest routes', () => {
  const contents = [
    record('zeta/job', 'retry', '2026-10-29T01:00:00+01:00'),
    record('zeta/job', 'retry', '2026-10-29T01:01:00+01:00'),
    record('zeta/job', 'retry', '2026-10-29T01:02:00+01:00'),
    record('zeta/job', 'ok', '2026-10-29T01:03:00+01:00'),
    record('alpha/job', 'fail', '2026-10-29T01:04:00+01:00'),
  ].join('\n');

  it('renders the digest as HTML, sorted by job and marks retries and failures', async () => {
    await withNight(contents, async (runsDir) => {
      const response = await createApp({ ...config, runsDir }).request('/digest/night');
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(html).toContain('<table>');
      expect(html.indexOf('alpha/job')).toBeLessThan(html.indexOf('zeta/job'));
      expect(html).toContain('class="warn"');
      expect(html).toContain('fail');
      expect(html).toContain('3');
    });
  });

  it('returns the same sorted rows as JSON', async () => {
    await withNight(contents, async (runsDir) => {
      const response = await createApp({ ...config, runsDir }).request('/api/digest/night');

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(await response.json()).toEqual([
        {
          job: 'alpha/job',
          owner: 'rook',
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: null,
          firstAt: '2026-10-29T01:04:00+01:00',
          lastAt: '2026-10-29T01:04:00+01:00',
        },
        {
          job: 'zeta/job',
          owner: 'rook',
          runs: 4,
          retries: 3,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T01:00:00+01:00',
          lastAt: '2026-10-29T01:03:00+01:00',
        },
      ]);
    });
  });

  it('returns 404 for a night that is not on disk on both routes', async () => {
    await withNight('', async (runsDir) => {
      const app = createApp({ ...config, runsDir });

      expect((await app.request('/digest/missing')).status).toBe(404);
      expect((await app.request('/api/digest/missing')).status).toBe(404);
    });
  });

  it('renders an empty night in HTML and as an empty JSON array', async () => {
    await withNight('', async (runsDir) => {
      const app = createApp({ ...config, runsDir });
      const htmlResponse = await app.request('/digest/night');
      const html = await htmlResponse.text();
      const jsonResponse = await app.request('/api/digest/night');

      expect(htmlResponse.status).toBe(200);
      expect(html).toContain('nothing ran');
      expect(jsonResponse.status).toBe(200);
      expect(await jsonResponse.json()).toEqual([]);
    });
  });

  it('serves valid rows when the night contains a malformed line', async () => {
    const malformedContents = [record('valid/job', 'ok', '2026-10-29T01:00:00+01:00'), '{bad json'].join('\n');

    await withNight(malformedContents, async (runsDir) => {
      const app = createApp({ ...config, runsDir });
      const htmlResponse = await app.request('/digest/night');
      const jsonResponse = await app.request('/api/digest/night');

      expect(htmlResponse.status).toBe(200);
      expect(await htmlResponse.text()).toContain('valid/job');
      expect(jsonResponse.status).toBe(200);
      expect(await jsonResponse.json()).toEqual([
        {
          job: 'valid/job',
          owner: 'rook',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T01:00:00+01:00',
          lastAt: '2026-10-29T01:00:00+01:00',
        },
      ]);
    });
  });
});
