import { resolveDbUrls } from './test-db-url';

process.env.DATABASE_URL = resolveDbUrls().testUrl;
process.env.THROTTLE_LIMIT = '100000';
// E2e suites must use the deterministic stub catalog even when the developer's
// .env carries a live CardboardTens key.
delete process.env.CARDBOARDTENS_API_KEY;
