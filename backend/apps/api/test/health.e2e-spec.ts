import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: ['health/live', 'health/ready', 'metrics', 'api/docs'],
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('/health/live returns ok', async () => {
    const response = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(response.body.status).toBe('ok');
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('/health/ready reports dependencies', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready');
    expect([200, 503]).toContain(response.status);
    expect(response.body.checks).toHaveProperty('database');
  });
});
