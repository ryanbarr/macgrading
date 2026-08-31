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

  const mintOne = async (cardboardTensId: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/certs')
      .set('Authorization', `Bearer ${token}`)
      .send({ cardboardTensId, isPrototype: false });
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

  it('rejects bad pagination', async () => {
    await request(app.getHttpServer()).get('/certs?page=0').expect(400);
    await request(app.getHttpServer()).get('/certs?pageSize=500').expect(400);
  });
});
