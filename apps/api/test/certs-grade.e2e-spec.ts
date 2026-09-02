import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { GOOGLE_TOKEN_VERIFIER } from './../src/auth/google-token-verifier';
import { resetDb } from './setup/test-db';

describe('cert grading', () => {
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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
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

  const mintOne = async (): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/certs')
      .set('Authorization', `Bearer ${token}`)
      .send({ cardboardTensId: 'cbt-0001', variant: 'Holofoil', isPrototype: false });
    return res.body.certNumber as string;
  };

  const grade = (certNumber: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/certs/${certNumber}/grade`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('requires auth', async () => {
    const certNumber = await mintOne();
    await request(app.getHttpServer())
      .patch(`/certs/${certNumber}/grade`)
      .send({ grade: '10' })
      .expect(401);
  });

  it('freezes the grade and its configured name', async () => {
    const certNumber = await mintOne();
    const res = await grade(certNumber, { grade: '10' }).expect(200);
    expect(res.body).toMatchObject({
      certNumber,
      status: 'GRADED',
      grade: '10',
      gradeName: 'Mac Daddy',
    });
    expect(res.body.gradedAt).toEqual(expect.any(String));
  });

  it('allows a grade with no configured name (name freezes as null)', async () => {
    const certNumber = await mintOne();
    const res = await grade(certNumber, { grade: '7' }).expect(200);
    expect(res.body.grade).toBe('7');
    expect(res.body.gradeName).toBeNull();
  });

  it('keeps the frozen name when the lookup table is renamed later', async () => {
    const certNumber = await mintOne();
    await grade(certNumber, { grade: '10' }).expect(200);
    await prisma.gradeName.update({
      where: { gradeValue: new Prisma.Decimal('10') },
      data: { name: 'Renamed Daddy' },
    });
    const cert = await prisma.cert.findUniqueOrThrow({ where: { certNumber } });
    expect(cert.gradeName).toBe('Mac Daddy');
  });

  it('409s on regrade — grades are frozen', async () => {
    const certNumber = await mintOne();
    await grade(certNumber, { grade: '10' }).expect(200);
    await grade(certNumber, { grade: '1' }).expect(409);
  });

  it('404s for unknown certs', async () => {
    await grade('999999999', { grade: '10' }).expect(404);
  });

  it('rejects invalid grade strings', async () => {
    const certNumber = await mintOne();
    for (const bad of ['0', '11', '10.5', '7.55', 'ten', '-3', '']) {
      await grade(certNumber, { grade: bad }).expect(400);
    }
  });

  it('records who graded it', async () => {
    const certNumber = await mintOne();
    await grade(certNumber, { grade: '1' }).expect(200);
    const cert = await prisma.cert.findUniqueOrThrow({ where: { certNumber } });
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'team@macgrading.com' },
    });
    expect(cert.gradedById).toBe(user.id);
  });
});
