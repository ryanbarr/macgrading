import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import {
  GOOGLE_TOKEN_VERIFIER,
  GoogleProfile,
} from './../src/auth/google-token-verifier';
import { resetDb } from './setup/test-db';

/** Fake verifier: treats the idToken itself as the email of the signing-in user. */
const fakeVerifier = {
  verify: async (idToken: string): Promise<GoogleProfile> => ({
    email: idToken,
    googleId: `google-${idToken}`,
    name: 'Test Person',
  }),
};

describe('auth', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GOOGLE_TOKEN_VERIFIER)
      .useValue(fakeVerifier)
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
      data: {
        email: 'team@macgrading.com',
        name: 'Team Member',
        role: 'TEAM_MEMBER',
      },
    });
    await prisma.user.create({
      data: {
        email: 'gone@macgrading.com',
        name: 'Former Member',
        role: 'TEAM_MEMBER',
        isActive: false,
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('exchanges a Google token for our JWT when the email is allowlisted', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'team@macgrading.com' })
      .expect(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toEqual({
      email: 'team@macgrading.com',
      name: 'Team Member',
      role: 'TEAM_MEMBER',
    });
  });

  it('stores the googleId on first sign-in', async () => {
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'team@macgrading.com' })
      .expect(201);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'team@macgrading.com' },
    });
    expect(user.googleId).toBe('google-team@macgrading.com');
  });

  it('rejects unknown emails', async () => {
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'stranger@example.com' })
      .expect(401);
  });

  it('rejects inactive users', async () => {
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'gone@macgrading.com' })
      .expect(401);
  });

  it('rejects an empty body', async () => {
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({})
      .expect(400);
  });

  it('GET /auth/me returns the current user with a valid token', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'team@macgrading.com' });
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200)
      .expect({
        email: 'team@macgrading.com',
        name: 'Team Member',
        role: 'TEAM_MEMBER',
      });
  });

  it('GET /auth/me rejects missing or garbage tokens', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
  });

  it('rejects a token whose user has since been deactivated', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'team@macgrading.com' });
    await prisma.user.update({
      where: { email: 'team@macgrading.com' },
      data: { isActive: false },
    });
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(401);
  });
});
