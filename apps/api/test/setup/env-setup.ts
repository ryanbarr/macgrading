import { resolveDbUrls } from './test-db-url';

process.env.DATABASE_URL = resolveDbUrls().testUrl;
process.env.THROTTLE_LIMIT = '100000';
