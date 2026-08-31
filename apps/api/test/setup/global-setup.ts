import { execSync } from 'child_process';
import * as path from 'path';
import { Client } from 'pg';
import { resolveDbUrls } from './test-db-url';

export default async function globalSetup() {
  const { devUrl, testUrl } = resolveDbUrls();
  const testDbName = new URL(testUrl).pathname.slice(1);

  const admin = new Client({ connectionString: devUrl });
  await admin.connect();
  const exists = await admin.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [testDbName],
  );
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${testDbName}"`);
  }
  await admin.end();

  execSync('pnpm exec prisma migrate deploy', {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  });
}
