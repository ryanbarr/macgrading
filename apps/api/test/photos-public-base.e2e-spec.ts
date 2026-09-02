import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { GOOGLE_TOKEN_VERIFIER } from './../src/auth/google-token-verifier';
import { resetDb } from './setup/test-db';

const PUBLIC_BASE = 'https://img.example.com';

describe('S3_PUBLIC_BASE_URL override', () => {
  let app: INestApplication;
  let token: string;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    process.env.S3_PUBLIC_BASE_URL = PUBLIC_BASE;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GOOGLE_TOKEN_VERIFIER)
      .useValue({
        verify: async (idToken: string) => ({
          email: idToken,
          googleId: `google-${idToken}`,
          name: 'Test',
        }),
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    await resetDb(prisma);
    await prisma.user.create({
      data: { email: 'team@macgrading.com', name: 'Team', role: 'TEAM_MEMBER' },
    });
    const login = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'team@macgrading.com' });
    token = login.body.accessToken;
  });

  afterAll(async () => {
    delete process.env.S3_PUBLIC_BASE_URL;
    await app.close();
    await prisma.$disconnect();
  });

  it('serves photo URLs from the public base with no bucket segment', async () => {
    const mint = await request(app.getHttpServer())
      .post('/certs')
      .set('Authorization', `Bearer ${token}`)
      .send({ cardboardTensId: 'cbt-0001', isPrototype: false, variant: 'Holofoil' })
      .expect(201);
    const certNumber = mint.body.certNumber as string;

    const presign = await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos/presign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contentType: 'image/jpeg' })
      .expect(201);
    const put = await fetch(presign.body.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
    });
    expect(put.ok).toBe(true);
    await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ objectKey: presign.body.objectKey, sortOrder: 0 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/certs/${certNumber}`)
      .expect(200);
    const url = res.body.photos[0].url as string;
    expect(url.startsWith(`${PUBLIC_BASE}/`)).toBe(true);
    expect(url).not.toContain(process.env.S3_BUCKET!);
    expect(url).toContain(presign.body.objectKey);
  });
});
