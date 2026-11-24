import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { OutboxDispatcherService } from '../src/platform/outbox/outbox-dispatcher.service';

describe('Business workflows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dispatcher: OutboxDispatcherService;
  const suffix = Date.now();
  const email = `biz+${suffix}@example.com`;
  const password = 'TestPass!2345';
  let accessToken = '';
  let tenantSlug = '';
  let headers: Record<string, string>;
  let employeeId = '';
  let adminUserId = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1', {
      exclude: ['health/live', 'health/ready', 'metrics', 'api/docs'],
    });
    await app.init();
    prisma = app.get(PrismaService);
    dispatcher = app.get(OutboxDispatcherService);

    const http = request(app.getHttpServer());
    const registration = await http
      .post('/api/v1/auth/register')
      .set('X-Tenant-Slug', 'demo')
      .send({ name: 'Business E2E', tenantName: `Business Tenant ${suffix}`, email, password })
      .expect(201);
    accessToken = registration.body.data.accessToken;
    tenantSlug = registration.body.data.tenantSlug;
    adminUserId = registration.body.data.user.id as string;
    headers = { Authorization: `Bearer ${accessToken}`, 'X-Tenant-Slug': tenantSlug };

    const department = await http
      .post('/api/v1/departments')
      .set(headers)
      .send({ name: 'Engineering' })
      .expect(201);
    const employee = await http
      .post('/api/v1/employees')
      .set(headers)
      .send({
        firstName: 'Casey',
        lastName: 'Nguyen',
        workEmail: `casey+${suffix}@example.com`,
        departmentId: department.body.data.id,
        status: 'active',
      })
      .expect(201);
    employeeId = employee.body.data.id as string;
    await prisma.user.update({ where: { id: adminUserId }, data: { employeeId } });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('runs the leave workflow end to end and updates balances', async () => {
    const http = request(app.getHttpServer());
    const type = await http
      .post('/api/v1/leave/types')
      .set(headers)
      .send({
        code: `ANNUAL_${suffix}`,
        name: 'Annual leave',
        annualAllowanceDays: 20,
        accrualPerMonthDays: 1.67,
      })
      .expect(201);

    const requested = await http
      .post('/api/v1/leave/requests')
      .set(headers)
      .send({
        employeeId,
        leaveTypeId: type.body.data.id,
        startDate: '2026-12-07T00:00:00.000Z',
        endDate: '2026-12-09T00:00:00.000Z',
        reason: 'Family event',
        approverUserId: adminUserId,
      })
      .expect(201);
    expect(requested.body.data.status).toBe('pending');

    const pendingBalance = await http
      .get('/api/v1/leave/balances')
      .set(headers)
      .query({ employeeId })
      .expect(200);
    expect(pendingBalance.body.data[0].pendingDays).toBe(3);

    await http
      .patch(`/api/v1/leave/requests/${requested.body.data.id}/decision`)
      .set(headers)
      .send({ decision: 'approved' })
      .expect(200);

    await dispatcher.dispatchPending(100);

    const decided = await http
      .get(`/api/v1/leave/requests?employeeId=${employeeId}`)
      .set(headers)
      .expect(200);
    expect(decided.body.data[0].status).toBe('approved');

    const balance = await http
      .get('/api/v1/leave/balances')
      .set(headers)
      .query({ employeeId })
      .expect(200);
    expect(balance.body.data[0].usedDays).toBe(3);
    expect(balance.body.data[0].pendingDays).toBe(0);
  });

  it('creates and decides a generic approval with notifications', async () => {
    const http = request(app.getHttpServer());
    const created = await http
      .post('/api/v1/approvals')
      .set(headers)
      .send({
        type: 'generic',
        subjectType: 'expense',
        subjectId: '11111111-1111-4111-8111-111111111111',
        steps: [{ stepOrder: 1, approverUserId: adminUserId }],
        metadata: { amount: 100 },
      })
      .expect(201);
    expect(created.body.data.status).toBe('pending');

    const inbox = await http.get('/api/v1/approvals').set(headers).expect(200);
    expect(inbox.body.data.some((item: { id: string }) => item.id === created.body.data.id)).toBe(
      true,
    );

    await http
      .patch(`/api/v1/approvals/${created.body.data.id}/decision`)
      .set(headers)
      .send({ decision: 'approved', comment: 'ok' })
      .expect(200);

    await dispatcher.dispatchPending(100);
    const notifications = await http.get('/api/v1/notifications').set(headers).expect(200);
    expect(notifications.body.data.length).toBeGreaterThan(0);
  });

  it('records attendance and calculates payroll', async () => {
    const http = request(app.getHttpServer());
    await http
      .post('/api/v1/attendance/clock-in')
      .set(headers)
      .send({ employeeId, at: '2026-11-23T09:00:00.000Z' })
      .expect(201);
    await http
      .post('/api/v1/attendance/clock-out')
      .set(headers)
      .send({ employeeId, at: '2026-11-23T17:00:00.000Z' })
      .expect(201);

    const summary = await http
      .get('/api/v1/attendance/summary')
      .set(headers)
      .query({ employeeId, from: '2026-11-01', to: '2026-11-30' })
      .expect(200);
    expect(summary.body.data[0].hours).toBe(8);

    await http
      .post('/api/v1/payroll/structures')
      .set(headers)
      .send({
        employeeId,
        currency: 'USD',
        baseSalaryMinor: '50000000',
        allowanceMinor: '5000000',
        effectiveFrom: '2026-11-01',
      })
      .expect(201);

    const run = await http
      .post('/api/v1/payroll/runs')
      .set(headers)
      .send({
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
        currency: 'USD',
        taxRateBps: 1000,
      })
      .expect(201);
    expect(run.body.data.totalGrossMinor).toBe('55000000');
    expect(run.body.data.totalNetMinor).toBe('49500000');

    const approved = await http
      .patch(`/api/v1/payroll/runs/${run.body.data.id}/approve`)
      .set(headers)
      .send({})
      .expect(200);
    expect(approved.body.data.status).toBe('approved');
  });

  it('hires a candidate through recruiting and records performance', async () => {
    const http = request(app.getHttpServer());
    const vacancy = await http
      .post('/api/v1/recruiting/vacancies')
      .set(headers)
      .send({ code: `VAC-${suffix}`, title: 'Platform Engineer' })
      .expect(201);
    const candidate = await http
      .post('/api/v1/recruiting/candidates')
      .set(headers)
      .send({ firstName: 'Riley', lastName: 'Chen', email: `riley+${suffix}@example.com` })
      .expect(201);
    const application = await http
      .post('/api/v1/recruiting/applications')
      .set(headers)
      .send({ vacancyId: vacancy.body.data.id, candidateId: candidate.body.data.id })
      .expect(201);
    const offer = await http
      .post(`/api/v1/recruiting/applications/${application.body.data.id}/offers`)
      .set(headers)
      .send({ salaryMinor: '60000000', currency: 'USD', startDate: '2026-12-01' })
      .expect(201);
    const hired = await http
      .patch(`/api/v1/recruiting/offers/${offer.body.data.id}/accept`)
      .set(headers)
      .expect(200);
    expect(hired.body.data.status).toBe('onboarding');

    const cycle = await http
      .post('/api/v1/performance/cycles')
      .set(headers)
      .send({ name: `H2 2026 ${suffix}`, startDate: '2026-07-01', endDate: '2026-12-31' })
      .expect(201);
    await http
      .post('/api/v1/performance/goals')
      .set(headers)
      .send({ cycleId: cycle.body.data.id, employeeId, title: 'Ship platform features' })
      .expect(201);
    const review = await http
      .post('/api/v1/performance/reviews')
      .set(headers)
      .send({ cycleId: cycle.body.data.id, employeeId, rating: 4 })
      .expect(201);
    const submitted = await http
      .patch(`/api/v1/performance/reviews/${review.body.data.id}/submit`)
      .set(headers)
      .send({ rating: 4 })
      .expect(200);
    expect(submitted.body.data.status).toBe('submitted');

    const calibration = await http
      .get('/api/v1/performance/calibration')
      .set(headers)
      .query({ cycleId: cycle.body.data.id })
      .expect(200);
    expect(calibration.body.data).toHaveLength(1);
  });
});
