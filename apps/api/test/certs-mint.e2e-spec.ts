import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { GOOGLE_TOKEN_VERIFIER } from './../src/auth/google-token-verifier';
import { resetDb } from './setup/test-db';

describe('cert minting', () => {
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

  const mint = (body: object) =>
    request(app.getHttpServer())
      .post('/certs')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('requires auth', async () => {
    await request(app.getHttpServer())
      .post('/certs')
      .send({ cardboardTensId: 'cbt-0001', isPrototype: false })
      .expect(401);
  });

  it('mints sequential standard numbers with a full card snapshot', async () => {
    const first = await mint({
      cardboardTensId: 'cbt-0001',
      isPrototype: false,
    }).expect(201);
    expect(first.body).toMatchObject({
      certNumber: '000000001',
      isPrototype: false,
      status: 'PENDING_GRADE',
      cardboardTensId: 'cbt-0001',
      cardName: 'Charizard',
      setName: 'Base Set',
      cardNumber: '4/102',
      releaseYear: 1999,
      category: 'Pokemon',
      grade: null,
      gradeName: null,
      photos: [],
    });
    expect(first.body).not.toHaveProperty('id');

    const second = await mint({
      cardboardTensId: 'cbt-0002',
      isPrototype: false,
    }).expect(201);
    expect(second.body.certNumber).toBe('000000002');
  });

  it('prototype numbers run on their own sequence', async () => {
    await mint({ cardboardTensId: 'cbt-0001', isPrototype: false }).expect(201);
    const proto = await mint({
      cardboardTensId: 'cbt-0002',
      isPrototype: true,
    }).expect(201);
    expect(proto.body.certNumber).toBe('P000000001');
  });

  it('404s for an unknown card and does not consume a number', async () => {
    await mint({ cardboardTensId: 'cbt-nope', isPrototype: false }).expect(404);
    const next = await mint({
      cardboardTensId: 'cbt-0001',
      isPrototype: false,
    }).expect(201);
    expect(next.body.certNumber).toBe('000000001');
  });

  it('rejects malformed bodies', async () => {
    await mint({ cardboardTensId: 'cbt-0001' }).expect(400);
    await mint({ isPrototype: true }).expect(400);
  });

  it('concurrent mints produce unique consecutive numbers with no gaps', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        mint({ cardboardTensId: 'cbt-0001', isPrototype: false }),
      ),
    );
    const numbers = results.map((r) => {
      expect(r.status).toBe(201);
      return r.body.certNumber as string;
    });
    expect(new Set(numbers).size).toBe(10);
    expect([...numbers].sort()).toEqual(
      Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(9, '0')),
    );
  });
});
