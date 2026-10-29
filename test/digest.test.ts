import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

describe('night reader', () => {
  it('aggregates the checked-in night and counts its malformed line', () => {
    const { rows, malformedLines } = readNight('runs', '2026-10-28');

    expect(rows).toHaveLength(5);
    expect(malformedLines).toBe(1);
    expect(rows.find(({ job }) => job === 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(rows.find(({ job }) => job === 'digest/render')?.owner).toBeNull();
    expect(rows.find(({ job }) => job === 'notes/backup')?.lastStatus).toBe('fail');
  });

  it('keeps valid records around malformed input and counts attempts', () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    const contents = [
      JSON.stringify({ at: '2026-10-28T23:00:00-04:00', job: 'job/a', status: 'retry', owner: null, error: 'busy' }),
      '{bad json',
      '',
      JSON.stringify({ at: '2026-10-29T00:00:00-04:00', job: 'job/a', status: 'fail', owner: 'rook' }),
      JSON.stringify({ at: 'invalid', job: 'job/b', status: 'unknown', owner: 'rook' }),
      '',
    ].join('\n');

    try {
      writeFileSync(join(runsDir, 'night.jsonl'), contents);
      const { rows, malformedLines } = readNight(runsDir, 'night');

      expect(malformedLines).toBe(3);
      expect(rows).toEqual([
        {
          job: 'job/a',
          owner: 'rook',
          runs: 2,
          retries: 1,
          lastStatus: 'fail',
          lastError: 'busy',
          firstAt: '2026-10-28T23:00:00-04:00',
          lastAt: '2026-10-29T00:00:00-04:00',
        },
      ]);

      writeFileSync(join(runsDir, 'night.jsonl'), '');
      expect(readNight(runsDir, 'night')).toEqual({ rows: [], malformedLines: 0 });
    } finally {
      rmSync(runsDir, { recursive: true, force: true });
    }
  });
});
