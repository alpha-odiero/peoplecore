import { createHash } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { ROLE_PERMISSIONS } from '@peoplecore/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Security gates (e2e)', () => {
  let app: INestApplication;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'Security!2345';
  let adminToken = '';
  let adminSlug = '';
  let otherAdminToken = '';
  let otherAdminSlug = '';
  let employeeToken = '';
  let auditorToken = '';
  let hrManagerToken = '';
  let employeeId = '';
  let documentId = '';
  let contractId = '';

  const http = () => request(app.getHttpServer());

  async function registerAdmin(
    label: string,
  ): Promise<{ token: string; slug: string; email: string }> {
    const email = `${label}.${suffix}@example.com`;
    const response = await http()
      .post('/api/v1/auth/register')
      .set('X-Tenant-Slug', 'demo')
      .send({ name: `${label} Admin`, tenantName: `${label} ${suffix}`, email, password })
      .expect(201);
    return {
      token: response.body.data.accessToken as string,
      slug: response.body.data.tenantSlug as string,
      email,
    };
  }

  async function login(slug: string, email: string): Promise<string> {
    const response = await http()
      .post('/api/v1/auth/login')
      .set('X-Tenant-Slug', slug)
      .send({ email, password })
      .expect(201);
    return response.body.data.accessToken as string;
  }

  async function invite(
    slug: string,
    token: string,
    email: string,
    roleKey: string,
  ): Promise<void> {
    await http()
      .post('/api/v1/users')
      .set({ Authorization: `Bearer ${token}`, 'X-Tenant-Slug': slug })
      .send({ email, firstName: roleKey, roleKey, password })
      .expect(201);
  }

  function headers(token: string, slug: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': slug };
  }

  async function importCsv(
    csv: string,
    key: string,
  ): Promise<{
    status: string;
    errors: Array<{ field: string; message: string }>;
  }> {
    const presign = await http()
      .post('/api/v1/imports/presign')
      .set(headers(adminToken, adminSlug))
      .send({
        idempotencyKey: `${key}-${suffix}`,
        mode: 'create_only',
        fileName: `${key}.csv`,
      })
      .expect(201);
    const uploadUrl = new URL(presign.body.data.uploadUrl as string);
    await http()
      .put(`${uploadUrl.pathname}${uploadUrl.search}`)
      .set('Content-Type', 'text/csv')
      .send(csv)
      .expect(200);
    const started = await http()
      .post(`/api/v1/imports/${presign.body.data.jobId as string}/start`)
      .set(headers(adminToken, adminSlug))
      .expect(201);
    return started.body.data as {
      status: string;
      errors: Array<{ field: string; message: string }>;
    };
  }

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

    const admin = await registerAdmin('sec-a');
    adminToken = admin.token;
    adminSlug = admin.slug;

    const otherAdmin = await registerAdmin('sec-b');
    otherAdminToken = otherAdmin.token;
    otherAdminSlug = otherAdmin.slug;

    const employeeEmail = `employee.${suffix}@example.com`;
    const auditorEmail = `auditor.${suffix}@example.com`;
    const hrManagerEmail = `hr-manager.${suffix}@example.com`;
    await invite(adminSlug, adminToken, employeeEmail, 'employee');
    await invite(adminSlug, adminToken, auditorEmail, 'auditor');
    await invite(adminSlug, adminToken, hrManagerEmail, 'hr_manager');
    employeeToken = await login(adminSlug, employeeEmail);
    auditorToken = await login(adminSlug, auditorEmail);
    hrManagerToken = await login(adminSlug, hrManagerEmail);

    const adminHeaders = {
      Authorization: `Bearer ${adminToken}`,
      'X-Tenant-Slug': adminSlug,
    };
    const department = await http()
      .post('/api/v1/departments')
      .set(adminHeaders)
      .send({ name: 'Security Engineering' })
      .expect(201);
    const employee = await http()
      .post('/api/v1/employees')
      .set(adminHeaders)
      .send({
        firstName: 'Security',
        lastName: 'Fixture',
        workEmail: `security.${suffix}@example.com`,
        departmentId: department.body.data.id,
      })
      .expect(201);
    employeeId = employee.body.data.id as string;

    const content = 'security fixture document';
    const checksum = createHash('sha256').update(content).digest('hex');
    const presign = await http()
      .post('/api/v1/documents/presign')
      .set(adminHeaders)
      .send({
        employeeId,
        documentType: 'other',
        fileName: 'security.txt',
        mimeType: 'text/plain',
        sizeBytes: String(Buffer.byteLength(content)),
        checksumSha256: checksum,
      })
      .expect(201);
    documentId = presign.body.data.documentId as string;
    const uploadUrl = new URL(presign.body.data.uploadUrl as string);
    await http()
      .put(`${uploadUrl.pathname}${uploadUrl.search}`)
      .set('Content-Type', 'text/plain')
      .send(content)
      .expect(200);
    await http()
      .post(`/api/v1/documents/${documentId}/confirm`)
      .set(adminHeaders)
      .send({ checksumSha256: checksum })
      .expect(201);

    const contract = await http()
      .post('/api/v1/contracts')
      .set(adminHeaders)
      .send({
        employeeId,
        type: 'permanent',
        startDate: '2026-01-01',
        salaryMinor: '750000',
        currency: 'USD',
        probationMonths: 3,
      })
      .expect(201);
    contractId = contract.body.data.id as string;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects unauthenticated access to protected routes', async () => {
    const response = await http().get('/api/v1/employees').expect(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it('rejects missing and unknown tenant slugs', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const missing = await http()
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
      expect(missing.body.code).toBe('TENANT_REQUIRED');
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }

    const unknown = await http()
      .get('/api/v1/employees')
      .set(headers(adminToken, 'missing-tenant'))
      .expect(404);
    expect(unknown.body.code).toBe('TENANT_NOT_FOUND');
  });

  it('denies employee-role users access to privileged writes', async () => {
    const response = await http()
      .post('/api/v1/employees')
      .set({ Authorization: `Bearer ${employeeToken}`, 'X-Tenant-Slug': adminSlug })
      .send({ firstName: 'Denied', lastName: 'User' })
      .expect(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('isolates tenant records on direct resource lookup', async () => {
    await http()
      .get(`/api/v1/employees/${employeeId}`)
      .set({ Authorization: `Bearer ${otherAdminToken}`, 'X-Tenant-Slug': otherAdminSlug })
      .expect(404);

    const mismatch = await http()
      .get(`/api/v1/employees/${employeeId}`)
      .set({ Authorization: `Bearer ${otherAdminToken}`, 'X-Tenant-Slug': adminSlug })
      .expect(403);
    expect(mismatch.body.code).toBe('FORBIDDEN');
  });

  it('treats suspicious query strings as literals and rejects invalid sort fields', async () => {
    const headers = { Authorization: `Bearer ${adminToken}`, 'X-Tenant-Slug': adminSlug };
    const injection = await http()
      .get('/api/v1/employees')
      .set(headers)
      .query({ q: "' OR 1=1 --" })
      .expect(200);
    expect(injection.body.meta.total).toBe(0);

    const invalidSort = await http()
      .get('/api/v1/employees')
      .set(headers)
      .query({ sortBy: 'name; DROP TABLE employees' })
      .expect(422);
    expect(invalidSort.body.code).toBe('VALIDATION_FAILED');
  });

  it('rejects unsafe document presign requests', async () => {
    const headers = { Authorization: `Bearer ${adminToken}`, 'X-Tenant-Slug': adminSlug };
    const badMime = await http()
      .post('/api/v1/documents/presign')
      .set(headers)
      .send({
        employeeId,
        documentType: 'other',
        fileName: 'malware.exe',
        mimeType: 'application/x-msdownload',
        sizeBytes: '16',
        checksumSha256: createHash('sha256').update('x').digest('hex'),
      })
      .expect(422);
    expect(badMime.body.code).toBe('VALIDATION_FAILED');

    const oversized = await http()
      .post('/api/v1/documents/presign')
      .set(headers)
      .send({
        employeeId,
        documentType: 'other',
        fileName: 'large.txt',
        mimeType: 'text/plain',
        sizeBytes: String(11 * 1024 * 1024),
        checksumSha256: createHash('sha256').update('x').digest('hex'),
      })
      .expect(413);
    expect(oversized.body.code).toBe('FILE_TOO_LARGE');
  });

  it('requires an uploaded object before confirming a document', async () => {
    const checksum = createHash('sha256').update('missing').digest('hex');
    const presign = await http()
      .post('/api/v1/documents/presign')
      .set({ Authorization: `Bearer ${adminToken}`, 'X-Tenant-Slug': adminSlug })
      .send({
        employeeId,
        documentType: 'other',
        fileName: 'missing.txt',
        mimeType: 'text/plain',
        sizeBytes: String(Buffer.byteLength('missing')),
        checksumSha256: checksum,
      })
      .expect(201);
    const response = await http()
      .post(`/api/v1/documents/${presign.body.data.documentId as string}/confirm`)
      .set({ Authorization: `Bearer ${adminToken}`, 'X-Tenant-Slug': adminSlug })
      .send({ checksumSha256: checksum })
      .expect(409);
    expect(response.body.code).toBe('OBJECT_NOT_FOUND');
  });

  it('prevents downloading another tenant’s document', async () => {
    const response = await http()
      .get(`/api/v1/documents/${documentId}/download`)
      .set({ Authorization: `Bearer ${otherAdminToken}`, 'X-Tenant-Slug': otherAdminSlug })
      .expect(404);
    expect(response.body.code).toBe('DOCUMENT_NOT_FOUND');
  });

  it('returns the same failure for unknown and wrong-password users', async () => {
    const unknown = await http()
      .post('/api/v1/auth/login')
      .set('X-Tenant-Slug', adminSlug)
      .send({ email: `missing.${suffix}@example.com`, password })
      .expect(401);
    const wrongPassword = await http()
      .post('/api/v1/auth/login')
      .set('X-Tenant-Slug', adminSlug)
      .send({ email: `employee.${suffix}@example.com`, password: 'WrongPass!2345' })
      .expect(401);
    expect(unknown.body.code).toBe(wrongPassword.body.code);
    expect(unknown.body.detail).toBe(wrongPassword.body.detail);
  });

  it('rejects mass-assigned tenant fields and oversized pagination', async () => {
    const massAssignment = await http()
      .post('/api/v1/employees')
      .set(headers(adminToken, adminSlug))
      .send({ firstName: 'Blocked', lastName: 'Tenant', tenantId: otherAdminSlug })
      .expect(422);
    expect(massAssignment.body.code).toBe('VALIDATION_FAILED');

    const oversizedPage = await http()
      .get('/api/v1/employees')
      .set(headers(adminToken, adminSlug))
      .query({ pageSize: 101 })
      .expect(422);
    expect(oversizedPage.body.code).toBe('VALIDATION_FAILED');
  });

  it('locks accounts after repeated failed logins', async () => {
    const email = `locked.${suffix}@example.com`;
    await invite(adminSlug, adminToken, email, 'employee');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await http()
        .post('/api/v1/auth/login')
        .set('X-Tenant-Slug', adminSlug)
        .send({ email, password: 'WrongPass!2345' })
        .expect(401);
    }
    const locked = await http()
      .post('/api/v1/auth/login')
      .set('X-Tenant-Slug', adminSlug)
      .send({ email, password })
      .expect(423);
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('requires a CSRF token for cookie refresh and sets hardened refresh cookies', async () => {
    const response = await http()
      .post('/api/v1/auth/register')
      .set('X-Tenant-Slug', 'demo')
      .send({
        name: `Csrf ${suffix}`,
        tenantName: `Csrf ${suffix}`,
        email: `csrf.${suffix}@example.com`,
        password,
      })
      .expect(201);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const slug = response.body.data.tenantSlug as string;
    const refreshCookie = cookies.find((cookie) => cookie.startsWith('pc_refresh='));
    const csrfCookie = cookies.find((cookie) => cookie.startsWith('pc_csrf='));
    expect(refreshCookie).toMatch(/HttpOnly/);
    expect(refreshCookie).toMatch(/SameSite=Strict/);
    expect(csrfCookie).not.toMatch(/HttpOnly/);

    await http()
      .post('/api/v1/auth/refresh')
      .set('X-Tenant-Slug', slug)
      .set('Cookie', cookies.map((cookie) => cookie.split(';')[0]).join('; '))
      .expect(403);
  });

  it('rejects expired refresh tokens', async () => {
    const login = await http()
      .post('/api/v1/auth/login')
      .set('X-Tenant-Slug', adminSlug)
      .send({ email: `employee.${suffix}@example.com`, password })
      .expect(201);
    const cookies = login.headers['set-cookie'] as unknown as string[];
    const csrfCookie = cookies.find((cookie) => cookie.startsWith('pc_csrf='))?.split(';')[0] ?? '';
    const csrfToken = csrfCookie.slice('pc_csrf='.length);
    const prisma = app.get(PrismaService);
    const user = await prisma.user.findFirstOrThrow({
      where: { email: `employee.${suffix}@example.com`, tenant: { slug: adminSlug } },
    });
    await prisma.refreshToken.updateMany({
      where: { tenantId: user.tenantId, userId: user.id, status: 'active' },
      data: { expiresAt: new Date(Date.now() + 10) },
    });
    await new Promise((resolve) => setTimeout(resolve, 25));

    const expired = await http()
      .post('/api/v1/auth/refresh')
      .set('X-Tenant-Slug', adminSlug)
      .set('Cookie', cookies.map((cookie) => cookie.split(';')[0]).join('; '))
      .set('x-csrf-token', csrfToken)
      .expect(401);
    expect(expired.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('revokes refresh sessions on logout and rejects refresh without a refresh cookie', async () => {
    const login = await http()
      .post('/api/v1/auth/login')
      .set('X-Tenant-Slug', adminSlug)
      .send({ email: `employee.${suffix}@example.com`, password })
      .expect(201);
    const cookies = login.headers['set-cookie'] as unknown as string[];
    const csrfCookie = cookies.find((cookie) => cookie.startsWith('pc_csrf='))?.split(';')[0] ?? '';
    const csrfToken = csrfCookie.slice('pc_csrf='.length);

    await http()
      .post('/api/v1/auth/logout')
      .set(headers(adminToken, adminSlug))
      .set('Cookie', cookies.map((cookie) => cookie.split(';')[0]).join('; '))
      .expect(204);

    const missingRefresh = await http()
      .post('/api/v1/auth/refresh')
      .set('X-Tenant-Slug', adminSlug)
      .set('Cookie', csrfCookie)
      .set('x-csrf-token', csrfToken)
      .expect(401);
    expect(missingRefresh.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects invalid password reset tokens', async () => {
    const response = await http()
      .post('/api/v1/auth/reset-password')
      .set('X-Tenant-Slug', adminSlug)
      .send({ token: 'invalid-reset-token-0123456789', newPassword: 'Reset!234567890' })
      .expect(400);
    expect(response.body.code).toBe('INVALID_RESET_TOKEN');
  });

  it('returns an identical forgot-password response for known and unknown users', async () => {
    const known = await http()
      .post('/api/v1/auth/forgot-password')
      .set('X-Tenant-Slug', adminSlug)
      .send({ email: `employee.${suffix}@example.com` })
      .expect(202);
    const unknown = await http()
      .post('/api/v1/auth/forgot-password')
      .set('X-Tenant-Slug', adminSlug)
      .send({ email: `unknown.${suffix}@example.com` })
      .expect(202);
    expect(known.body).toEqual(unknown.body);
  });

  it('accepts optional contract fields and paginated contract queries', async () => {
    const updated = await http()
      .patch(`/api/v1/contracts/${contractId}`)
      .set(headers(adminToken, adminSlug))
      .send({ workingHoursWeek: 35, probationMonths: 6 })
      .expect(200);
    expect(updated.body.data.probationMonths).toBe(6);

    await http()
      .get('/api/v1/contracts')
      .set(headers(adminToken, adminSlug))
      .query({ page: 1, pageSize: 10 })
      .expect(200);
  });

  it('redacts salary fields without employees.view_salary', async () => {
    const privileged = await http()
      .get(`/api/v1/contracts/${contractId}`)
      .set(headers(adminToken, adminSlug))
      .expect(200);
    expect(privileged.body.data.salaryMinor).toBe('750000');

    const redacted = await http()
      .get(`/api/v1/contracts/${contractId}`)
      .set(headers(auditorToken, adminSlug))
      .expect(200);
    expect(redacted.body.data.salaryMinor).toBeNull();
    expect(redacted.body.data.currency).toBeNull();
  });

  it('does not expose audit or history mutation endpoints', async () => {
    const audit = await http().get('/api/v1/audit').set(headers(adminToken, adminSlug)).expect(200);
    const auditId = (audit.body.data as Array<{ id: string }>)[0]?.id;
    expect(auditId).toBeDefined();

    await http()
      .patch(`/api/v1/audit/${auditId}`)
      .set(headers(adminToken, adminSlug))
      .send({ action: 'tampered' })
      .expect(404);
    await http().delete(`/api/v1/audit/${auditId}`).set(headers(adminToken, adminSlug)).expect(404);

    const history = await http()
      .get(`/api/v1/employees/${employeeId}/history`)
      .set(headers(adminToken, adminSlug))
      .expect(200);
    const historyId = (history.body.data as Array<{ id: string }>)[0]?.id;
    expect(historyId).toBeDefined();

    await http()
      .patch(`/api/v1/employees/${employeeId}/history/${historyId}`)
      .set(headers(adminToken, adminSlug))
      .send({ eventType: 'tampered' })
      .expect(404);
    await http()
      .delete(`/api/v1/employees/${employeeId}/history/${historyId}`)
      .set(headers(adminToken, adminSlug))
      .expect(404);
  });

  it('rejects formula-style values in CSV imports', async () => {
    const result = await importCsv(
      'employeeNumber,firstName,lastName,workEmail\nCSV-SEC,=1+1,Injection,csv.sec@example.com',
      'malicious-csv',
    );
    expect(result.status).toBe('failed');
    expect(
      result.errors.some((error) => error.message === 'Formula-style values are not allowed'),
    ).toBe(true);
  });

  it('allows only one concurrent status change for the same employee version', async () => {
    const settled = await Promise.allSettled([
      http()
        .patch(`/api/v1/employees/${employeeId}/status`)
        .set(headers(adminToken, adminSlug))
        .send({ status: 'active' })
        .then((response) => response),
      http()
        .patch(`/api/v1/employees/${employeeId}/status`)
        .set(headers(adminToken, adminSlug))
        .send({ status: 'active' })
        .then((response) => response),
    ]);
    expect(settled.every((result) => result.status === 'fulfilled')).toBe(true);
    const responses = settled.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    const conflicts = responses.filter((response) => response.status === 409);
    expect(conflicts).toHaveLength(1);
    expect(['VERSION_CONFLICT', 'INVALID_STATUS_TRANSITION']).toContain(
      conflicts[0]?.body.code as string,
    );
  });

  it('updates employee profiles and records employment history', async () => {
    const updated = await http()
      .patch(`/api/v1/employees/${employeeId}`)
      .set(headers(adminToken, adminSlug))
      .send({
        firstName: 'Updated',
        jobProfileTitle: 'Security Engineer',
        hireDate: '2024-01-01',
      })
      .expect(200);
    expect(updated.body.data.firstName).toBe('Updated');

    const history = await http()
      .get(`/api/v1/employees/${employeeId}/history`)
      .set(headers(adminToken, adminSlug))
      .expect(200);
    expect(
      (history.body.data as Array<{ eventType: string }>).some(
        (item) => item.eventType === 'updated',
      ),
    ).toBe(true);
  });

  it('validates and applies bulk employee status changes', async () => {
    const bulkEmployee = await http()
      .post('/api/v1/employees')
      .set(headers(adminToken, adminSlug))
      .send({
        firstName: 'Bulk',
        lastName: 'Fixture',
        workEmail: `bulk.${suffix}@example.com`,
      })
      .expect(201);
    const bulkEmployeeId = bulkEmployee.body.data.id as string;

    const invalid = await http()
      .post('/api/v1/employees/bulk-status')
      .set(headers(adminToken, adminSlug))
      .send({ ids: [employeeId, bulkEmployeeId], status: 'active' })
      .expect(409);
    expect(invalid.body.code).toBe('INVALID_STATUS_TRANSITION');

    const archived = await http()
      .post('/api/v1/employees/bulk-status')
      .set(headers(adminToken, adminSlug))
      .send({ ids: [employeeId, bulkEmployeeId], status: 'archived', reason: 'Bulk archive' })
      .expect(201);
    expect(archived.body.data.updated).toBe(2);
  });

  it('applies permission revocations on the next request', async () => {
    const adminHeaders = { Authorization: `Bearer ${adminToken}`, 'X-Tenant-Slug': adminSlug };
    const managerHeaders = {
      Authorization: `Bearer ${hrManagerToken}`,
      'X-Tenant-Slug': adminSlug,
    };
    await http()
      .post('/api/v1/employees')
      .set(managerHeaders)
      .send({ firstName: 'Before', lastName: 'Revoke' })
      .expect(201);

    const roles = await http().get('/api/v1/roles').set(adminHeaders).expect(200);
    const role = (roles.body.data as Array<{ id: string; key: string }>).find(
      (item) => item.key === 'hr_manager',
    );
    expect(role).toBeDefined();
    await http()
      .patch(`/api/v1/roles/${role?.id}/permissions`)
      .set(adminHeaders)
      .send({
        roleId: role?.id,
        permissionKeys: ROLE_PERMISSIONS.hr_manager.filter(
          (permission) => permission !== 'employees.create',
        ),
      })
      .expect(200);

    const denied = await http()
      .post('/api/v1/employees')
      .set(managerHeaders)
      .send({ firstName: 'After', lastName: 'Revoke' })
      .expect(403);
    expect(denied.body.code).toBe('FORBIDDEN');
  });
});
