import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { GOOGLE_TOKEN_VERIFIER } from './../src/auth/google-token-verifier';
import { resetDb } from './setup/test-db';

describe('cert photos', () => {
  let app: INestApplication;
  let token: string;
  const prisma = new PrismaClient();

  beforeAll(async () => {
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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.user.create({
      data: { email: 'team@macgrading.com', name: 'Team', role: 'TEAM_MEMBER' },
    });
    const res = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'team@macgrading.com' });
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const authed = () => ({ Authorization: `Bearer ${token}` });

  const mintOne = async (): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/certs')
      .set(authed())
      .send({ cardboardTensId: 'cbt-0001', isPrototype: false });
    return res.body.certNumber as string;
  };

  const uploadPhoto = async (certNumber: string): Promise<string> => {
    const presign = await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos/presign`)
      .set(authed())
      .send({ contentType: 'image/jpeg' })
      .expect(201);
    const { uploadUrl, objectKey } = presign.body;
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
    });
    expect(put.ok).toBe(true);
    return objectKey as string;
  };

  it('presign requires auth and a known cert', async () => {
    const certNumber = await mintOne();
    await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos/presign`)
      .send({ contentType: 'image/jpeg' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/certs/999999999/photos/presign')
      .set(authed())
      .send({ contentType: 'image/jpeg' })
      .expect(404);
  });

  it('rejects disallowed content types', async () => {
    const certNumber = await mintOne();
    await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos/presign`)
      .set(authed())
      .send({ contentType: 'application/pdf' })
      .expect(400);
  });

  it('full round trip: presign → upload → register → visible on the cert', async () => {
    const certNumber = await mintOne();
    const objectKey = await uploadPhoto(certNumber);
    expect(objectKey).toMatch(/^certs\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/);

    const registered = await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos`)
      .set(authed())
      .send({ objectKey, sortOrder: 0 })
      .expect(201);
    expect(registered.body).toMatchObject({
      id: expect.any(String),
      sortOrder: 0,
      url: expect.stringContaining(objectKey),
    });
  });

  it('refuses to register a key that was never uploaded', async () => {
    const certNumber = await mintOne();
    const presign = await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos/presign`)
      .set(authed())
      .send({ contentType: 'image/jpeg' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos`)
      .set(authed())
      .send({ objectKey: presign.body.objectKey })
      .expect(400);
  });

  it("refuses to register another cert's key", async () => {
    const certA = await mintOne();
    const certB = await mintOne();
    const objectKey = await uploadPhoto(certA);
    await request(app.getHttpServer())
      .post(`/certs/${certB}/photos`)
      .set(authed())
      .send({ objectKey })
      .expect(400);
  });

  it('refuses to register the same objectKey twice', async () => {
    const certNumber = await mintOne();
    const objectKey = await uploadPhoto(certNumber);
    await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos`)
      .set(authed())
      .send({ objectKey })
      .expect(201);
    const duplicate = await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos`)
      .set(authed())
      .send({ objectKey })
      .expect(409);
    expect(duplicate.body.message).toContain('already registered');
  });

  it('deletes a photo', async () => {
    const certNumber = await mintOne();
    const objectKey = await uploadPhoto(certNumber);
    const registered = await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos`)
      .set(authed())
      .send({ objectKey })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/certs/${certNumber}/photos/${registered.body.id}`)
      .set(authed())
      .expect(204);
    const photos = await prisma.certPhoto.findMany();
    expect(photos).toHaveLength(0);
  });
});
