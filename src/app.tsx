import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/read-night.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestPage } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/api/digest/:night', (c) => {
    const { night } = c.req.param();
    if (!/^[\w-]+$/.test(night)) return c.json({ error: 'Night not found' }, 404);

    try {
      const { rows } = readNight(config.runsDir, night);
      return c.json(rows.sort((a, b) => a.job.localeCompare(b.job)));
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        return c.json({ error: 'Night not found' }, 404);
      }
      throw error;
    }
  });

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    if (!/^[\w-]+$/.test(night)) return c.notFound();

    try {
      const digest = readNight(config.runsDir, night);
      return c.html(
        <Layout title={`digest · ${night}`} lane={lane()}>
          <DigestPage night={night} rows={digest.rows} />
        </Layout>,
      );
    } catch (error) {
      if (isMissingFile(error)) return c.notFound();
      throw error;
    }
  });

  return app;
}
