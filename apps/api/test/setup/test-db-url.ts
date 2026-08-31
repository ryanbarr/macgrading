import * as path from 'path';
import * as dotenv from 'dotenv';

/** Loads apps/api/.env and returns { devUrl, testUrl } where testUrl targets `<db>_test`. */
export function resolveDbUrls(): { devUrl: string; testUrl: string } {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  const devUrl = process.env.DATABASE_URL;
  if (!devUrl) {
    throw new Error(
      'DATABASE_URL missing — copy .env.example to apps/api/.env',
    );
  }
  const url = new URL(devUrl);
  url.pathname = `${url.pathname}_test`;
  return { devUrl, testUrl: url.toString() };
}
