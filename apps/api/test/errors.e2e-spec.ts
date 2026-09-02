import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('error responses', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('unknown routes get the standard error shape (filter active)', () => {
    return request(app.getHttpServer()).get('/nope').expect(404).expect({
      statusCode: 404,
      message: 'Cannot GET /nope',
      error: 'Not Found',
    });
  });
});
