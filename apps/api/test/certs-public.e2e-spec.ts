import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { GOOGLE_TOKEN_VERIFIER } from './../src/auth/google-token-verifier';
import { resetDb } from './setup/test-db';

describe('public cert endpoints', () => {
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

  // Stub cards' first listed variant, required at mint time.
  const DEFAULT_VARIANTS: Record<string, string> = {
    'cbt-0001': 'Holofoil',
    'cbt-0002': '1st Edition',
  };

  const mintOne = async (cardboardTensId: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/certs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cardboardTensId,
        isPrototype: false,
        variant: DEFAULT_VARIANTS[cardboardTensId],
      });
    return res.body.certNumber as string;
  };

  it('looks up a cert with no auth', async () => {
    const certNumber = await mintOne('cbt-0001');
    const res = await request(app.getHttpServer())
      .get(`/certs/${certNumber}`)
      .expect(200);
    expect(res.body).toMatchObject({
      certNumber,
      cardName: 'Charizard',
      status: 'PENDING_GRADE',
    });
    expect(res.body).not.toHaveProperty('id');
  });

  it('404s cleanly for unknown and malformed numbers', async () => {
    await request(app.getHttpServer()).get('/certs/999999999').expect(404);
    await request(app.getHttpServer()).get('/certs/not-a-cert').expect(404);
  });

  it('lists newest first with pagination', async () => {
    const first = await mintOne('cbt-0001');
    const second = await mintOne('cbt-0002');
    const res = await request(app.getHttpServer()).get('/certs').expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(20);
    expect(
      res.body.items.map((c: { certNumber: string }) => c.certNumber),
    ).toEqual([second, first]);

    const paged = await request(app.getHttpServer())
      .get('/certs?page=2&pageSize=1')
      .expect(200);
    expect(paged.body.items).toHaveLength(1);
    expect(paged.body.items[0].certNumber).toBe(first);
  });

  it('searches by card name fragment and exact cert number', async () => {
    const charizard = await mintOne('cbt-0001');
    await mintOne('cbt-0004');

    const byName = await request(app.getHttpServer())
      .get('/certs?q=chari')
      .expect(200);
    expect(byName.body.total).toBe(1);
    expect(byName.body.items[0].cardName).toBe('Charizard');

    const byNumber = await request(app.getHttpServer())
      .get(`/certs?q=${charizard}`)
      .expect(200);
    expect(byNumber.body.total).toBe(1);
    expect(byNumber.body.items[0].certNumber).toBe(charizard);
  });

  it('excludes test certs from the public list but serves them by number', async () => {
    await mintOne('cbt-0001');
    const testMint = await request(app.getHttpServer())
      .post('/certs')
      .set('Authorization', `Bearer ${token}`)
      .send({ cardboardTensId: 'cbt-0002', variant: '1st Edition', isPrototype: false, isTest: true })
      .expect(201);
    const testNumber = testMint.body.certNumber as string;

    const publicList = await request(app.getHttpServer()).get('/certs').expect(200);
    expect(publicList.body.total).toBe(1);
    expect(
      publicList.body.items.every((c: { isTest: boolean }) => !c.isTest),
    ).toBe(true);

    const testList = await request(app.getHttpServer())
      .get('/certs?test=true')
      .expect(200);
    expect(testList.body.total).toBe(1);
    expect(testList.body.items[0].certNumber).toBe(testNumber);

    const direct = await request(app.getHttpServer())
      .get(`/certs/${testNumber}`)
      .expect(200);
    expect(direct.body.isTest).toBe(true);
  });

  it('filters by exact grade and records the minter', async () => {
    const graded = await request(app.getHttpServer())
      .post('/certs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cardboardTensId: 'cbt-0001',
        isPrototype: false,
        variant: 'Holofoil',
        grade: '10',
      })
      .expect(201);
    await mintOne('cbt-0004'); // ungraded, no filter match

    const filtered = await request(app.getHttpServer())
      .get('/certs?grade=10')
      .expect(200);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.items[0].certNumber).toBe(graded.body.certNumber);

    await request(app.getHttpServer()).get('/certs?grade=11').expect(400);

    const row = await prisma.cert.findUniqueOrThrow({
      where: { certNumber: graded.body.certNumber as string },
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'team@macgrading.com' },
    });
    expect(row.createdById).toBe(user.id); // minter audited
  });

  it('rejects bad pagination', async () => {
    await request(app.getHttpServer()).get('/certs?page=0').expect(400);
    await request(app.getHttpServer()).get('/certs?pageSize=500').expect(400);
  });

  const uploadPhoto = async (certNumber: string): Promise<string> => {
    const presign = await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos/presign`)
      .set('Authorization', `Bearer ${token}`)
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

  it('shows a graded cert with photos, sorted, to an unauthenticated caller', async () => {
    const certNumber = await mintOne('cbt-0001');
    await request(app.getHttpServer())
      .patch(`/certs/${certNumber}/grade`)
      .set('Authorization', `Bearer ${token}`)
      .send({ grade: '10' })
      .expect(200);

    const objectKeyA = await uploadPhoto(certNumber);
    const objectKeyB = await uploadPhoto(certNumber);
    await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ objectKey: objectKeyA, sortOrder: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ objectKey: objectKeyB, sortOrder: 0 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/certs/${certNumber}`)
      .expect(200);

    expect(res.body).toMatchObject({
      status: 'GRADED',
      gradeName: 'Mac Daddy',
    });
    expect(res.body).not.toHaveProperty('id');
    expect(res.body.photos).toHaveLength(2);
    expect(res.body.photos.map((p: { sortOrder: number }) => p.sortOrder)).toEqual([
      0, 1,
    ]);

    const publicBase = `${process.env.S3_ENDPOINT!.replace(/\/$/, '')}/${process.env.S3_BUCKET}`;
    const [first, second] = res.body.photos as Array<{ url: string }>;
    expect(first.url.startsWith(publicBase)).toBe(true);
    expect(first.url).toContain(objectKeyB);
    expect(second.url.startsWith(publicBase)).toBe(true);
    expect(second.url).toContain(objectKeyA);
  });
});
