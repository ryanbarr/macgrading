import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { GOOGLE_TOKEN_VERIFIER } from './../src/auth/google-token-verifier';
import { resetDb } from './setup/test-db';

describe('void + admin surfaces', () => {
  let app: INestApplication;
  let adminToken: string;
  let teamToken: string;
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
      data: { email: 'admin@macgrading.com', name: 'Admin', role: 'ADMIN' },
    });
    await prisma.user.create({
      data: { email: 'team@macgrading.com', name: 'Team', role: 'TEAM_MEMBER' },
    });
    const login = async (email: string) =>
      (
        await request(app.getHttpServer())
          .post('/auth/google')
          .send({ idToken: email })
      ).body.accessToken as string;
    adminToken = await login('admin@macgrading.com');
    teamToken = await login('team@macgrading.com');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  const mintOne = async (): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/certs')
      .set(as(teamToken))
      .send({
        cardboardTensId: 'cbt-0001',
        isPrototype: false,
        variant: 'Holofoil',
        grade: '10',
      });
    return res.body.certNumber as string;
  };

  describe('voiding', () => {
    it('admin voids a cert; the record freezes and hides from listings', async () => {
      const certNumber = await mintOne();
      const voided = await request(app.getHttpServer())
        .post(`/certs/${certNumber}/void`)
        .set(as(adminToken))
        .send({ reason: 'wrong variant tapped' })
        .expect(201);
      expect(voided.body.status).toBe('VOIDED');
      expect(voided.body.voidedAt).toEqual(expect.any(String));
      expect(voided.body).not.toHaveProperty('voidReason'); // internal only

      const row = await prisma.cert.findUniqueOrThrow({ where: { certNumber } });
      expect(row.voidReason).toBe('wrong variant tapped');
      const admin = await prisma.user.findUniqueOrThrow({
        where: { email: 'admin@macgrading.com' },
      });
      expect(row.voidedById).toBe(admin.id);

      // Hidden from the public list, present with includeVoided, always
      // resolvable directly.
      const publicList = await request(app.getHttpServer()).get('/certs').expect(200);
      expect(publicList.body.total).toBe(0);
      // The public endpoint no longer accepts a voided toggle at all…
      await request(app.getHttpServer())
        .get('/certs?includeVoided=true')
        .expect(400);
      // …the admin route lists voided, gated by the void ability.
      const adminList = await request(app.getHttpServer())
        .get('/certs/admin/search')
        .set(as(adminToken))
        .expect(200);
      expect(adminList.body.total).toBe(1);
      await request(app.getHttpServer())
        .get('/certs/admin/search')
        .set(as(teamToken))
        .expect(403);
      await request(app.getHttpServer()).get('/certs/admin/search').expect(401);
      const direct = await request(app.getHttpServer())
        .get(`/certs/${certNumber}`)
        .expect(200);
      expect(direct.body.status).toBe('VOIDED');
    });

    it('team members cannot void', async () => {
      const certNumber = await mintOne();
      await request(app.getHttpServer())
        .post(`/certs/${certNumber}/void`)
        .set(as(teamToken))
        .send({})
        .expect(403);
    });

    it('voided certs are frozen: no regrade, no revoid, no new photos', async () => {
      const certNumber = await mintOne();
      await request(app.getHttpServer())
        .post(`/certs/${certNumber}/void`)
        .set(as(adminToken))
        .send({})
        .expect(201);
      await request(app.getHttpServer())
        .post(`/certs/${certNumber}/void`)
        .set(as(adminToken))
        .send({})
        .expect(409);
      await request(app.getHttpServer())
        .post(`/certs/${certNumber}/photos/presign`)
        .set(as(teamToken))
        .send({ contentType: 'image/jpeg' })
        .expect(409);
    });

    it('a PENDING_GRADE cert can be voided and then refuses grading', async () => {
      const res = await request(app.getHttpServer())
        .post('/certs')
        .set(as(teamToken))
        .send({ cardboardTensId: 'cbt-0004', isPrototype: false });
      const certNumber = res.body.certNumber as string;
      await request(app.getHttpServer())
        .post(`/certs/${certNumber}/void`)
        .set(as(adminToken))
        .send({})
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/certs/${certNumber}/grade`)
        .set(as(teamToken))
        .send({ grade: '10' })
        .expect(409);
    });
  });

  describe('user management', () => {
    it('admin lists, creates, and updates users; duplicates conflict', async () => {
      const created = await request(app.getHttpServer())
        .post('/users')
        .set(as(adminToken))
        .send({ email: 'New@MacGrading.com', role: 'TEAM_MEMBER' })
        .expect(201);
      expect(created.body.email).toBe('new@macgrading.com'); // normalized

      await request(app.getHttpServer())
        .post('/users')
        .set(as(adminToken))
        .send({ email: 'new@macgrading.com' })
        .expect(409);

      const list = await request(app.getHttpServer())
        .get('/users')
        .set(as(adminToken))
        .expect(200);
      expect(list.body).toHaveLength(3);

      const updated = await request(app.getHttpServer())
        .patch(`/users/${created.body.id}`)
        .set(as(adminToken))
        .send({ isActive: false, name: 'Renamed' })
        .expect(200);
      expect(updated.body.isActive).toBe(false);
      expect(updated.body.name).toBe('Renamed');
    });

    it('team members get 403 on every user route', async () => {
      await request(app.getHttpServer()).get('/users').set(as(teamToken)).expect(403);
      await request(app.getHttpServer())
        .post('/users')
        .set(as(teamToken))
        .send({ email: 'x@y.com' })
        .expect(403);
    });

    it('admins cannot deactivate themselves', async () => {
      const me = await prisma.user.findUniqueOrThrow({
        where: { email: 'admin@macgrading.com' },
      });
      await request(app.getHttpServer())
        .patch(`/users/${me.id}`)
        .set(as(adminToken))
        .send({ isActive: false })
        .expect(400);
    });
  });

  describe('grade name management', () => {
    it('admin upserts and deletes names; renames leave frozen certs alone', async () => {
      const certNumber = await mintOne(); // graded 10 → "Mac Daddy" frozen

      await request(app.getHttpServer())
        .put('/grade-names/7')
        .set(as(adminToken))
        .send({ name: 'Big Mac' })
        .expect(200);
      await request(app.getHttpServer())
        .put('/grade-names/10')
        .set(as(adminToken))
        .send({ name: 'Mac Daddy Supreme' })
        .expect(200);

      const names = await request(app.getHttpServer())
        .get('/grade-names')
        .set(as(teamToken))
        .expect(200);
      expect(names.body).toEqual([
        { gradeValue: '1', name: "Lil' Mac" },
        { gradeValue: '7', name: 'Big Mac' },
        { gradeValue: '10', name: 'Mac Daddy Supreme' },
      ]);

      const cert = await prisma.cert.findUniqueOrThrow({ where: { certNumber } });
      expect(cert.gradeName).toBe('Mac Daddy'); // frozen copy untouched

      await request(app.getHttpServer())
        .delete('/grade-names/7')
        .set(as(adminToken))
        .expect(204);
      await request(app.getHttpServer())
        .delete('/grade-names/7')
        .set(as(adminToken))
        .expect(404);
    });

    it('team members cannot modify names; bad values 400', async () => {
      await request(app.getHttpServer())
        .put('/grade-names/7')
        .set(as(teamToken))
        .send({ name: 'Nope' })
        .expect(403);
      await request(app.getHttpServer())
        .put('/grade-names/11')
        .set(as(adminToken))
        .send({ name: 'Too High' })
        .expect(400);
    });
  });
});
