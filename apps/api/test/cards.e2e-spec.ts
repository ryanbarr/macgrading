import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { GOOGLE_TOKEN_VERIFIER } from './../src/auth/google-token-verifier';
import { resetDb } from './setup/test-db';

describe('card catalog (stub)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer()).post('/auth/google').send({ idToken: email });
    return res.body.accessToken;
  };

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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.user.create({
      data: { email: 'team@macgrading.com', name: 'Team', role: 'TEAM_MEMBER' },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('requires auth', async () => {
    await request(app.getHttpServer()).get('/cards/search?q=char').expect(401);
  });

  it('finds cards by case-insensitive name fragment', async () => {
    const token = await login('team@macgrading.com');
    const res = await request(app.getHttpServer())
      .get('/cards/search?q=CHAR')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toMatchObject({
      cardboardTensId: expect.any(String),
      cardName: expect.stringMatching(/char/i),
      setName: expect.any(String),
    });
  });

  it('rejects queries shorter than 2 characters', async () => {
    const token = await login('team@macgrading.com');
    await request(app.getHttpServer())
      .get('/cards/search?q=c')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
