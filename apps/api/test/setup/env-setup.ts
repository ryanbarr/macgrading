import { resolveDbUrls } from './test-db-url';

process.env.DATABASE_URL = resolveDbUrls().testUrl;
