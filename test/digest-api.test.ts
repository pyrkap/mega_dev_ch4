import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

describe('digest API', () => {
  it('returns rows sorted by job', async () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-api-'));
    writeFileSync(
      join(runsDir, 'night.jsonl'),
      [
        JSON.stringify({ at: '2026-10-29T01:00:00+01:00', job: 'job/z', status: 'ok', owner: 'rook' }),
        JSON.stringify({ at: '2026-10-29T01:01:00+01:00', job: 'job/a', status: 'retry', owner: null }),
      ].join('\n'),
    );

    try {
      const response = await createApp({
        adapter: 'shim',
        installed: '2026-10-29T14:06:00+01:00',
        beatEverySeconds: 60,
        runsDir,
      }).request('/api/digest/night');

      expect(response.status).toBe(200);
      const rows = (await response.json()) as DigestRow[];
      expect(rows.map(({ job }) => job)).toEqual(['job/a', 'job/z']);
    } finally {
      rmSync(runsDir, { recursive: true, force: true });
    }
  });

  it('returns 404 when the night file is missing', async () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-api-'));

    try {
      const response = await createApp({
        adapter: 'shim',
        installed: '2026-10-29T14:06:00+01:00',
        beatEverySeconds: 60,
        runsDir,
      }).request('/api/digest/missing');

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Night not found' });
    } finally {
      rmSync(runsDir, { recursive: true, force: true });
    }
  });
});
