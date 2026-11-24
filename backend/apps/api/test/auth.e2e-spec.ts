import { createHash } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { ROLE_PERMISSIONS } from '@peoplecore/shared';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const suffix = Date.now();
  const email = `admin+${suffix}@example.com`;
  const password = 'TestPass!2345';
  let accessToken = '';
  let tenantSlug = '';

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
  });

  afterAll(async () => {
    await app?.close();
  });

  it('registers a tenant, authenticates, and refreshes the session', async () => {
    const http = request(app.getHttpServer());
    const registration = await http
      .post('/api/v1/auth/register')
      .set('X-Tenant-Slug', 'demo')
      .send({ name: 'E2E Admin', tenantName: `E2E Tenant ${suffix}`, email, password })
      .expect(201);

    const auth = registration.body.data;
    accessToken = auth.accessToken;
    tenantSlug = auth.tenantSlug;
    expect(auth.accessToken).toBeDefined();
    expect(auth.tenantSlug).toMatch(/^e2e-tenant/);
    expect(auth.user.permissions).toContain('employees.read');
    expect(registration.headers['set-cookie']).toBeDefined();

    await http
      .get('/api/v1/auth/me')
      .set('X-Tenant-Slug', auth.tenantSlug)
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.email).toBe(email);
      });

    const cookies = registration.headers['set-cookie'] as unknown as string[];
    const csrfCookie = cookies.find((cookie) => cookie.startsWith('pc_csrf='));
    const csrfToken = decodeURIComponent(csrfCookie?.split(';')[0]?.split('=')[1] ?? '');
    expect(csrfToken).toBeTruthy();

    const refreshed = await http
      .post('/api/v1/auth/refresh')
      .set('X-Tenant-Slug', auth.tenantSlug)
      .set('Cookie', cookies.map((cookie) => cookie.split(';')[0]).join('; '))
      .set('X-CSRF-Token', csrfToken)
      .expect(201);
    expect(refreshed.body.data.accessToken).toBeDefined();

    await http
      .post('/api/v1/auth/refresh')
      .set('X-Tenant-Slug', auth.tenantSlug)
      .set('Cookie', cookies.map((cookie) => cookie.split(';')[0]).join('; '))
      .set('X-CSRF-Token', csrfToken)
      .expect(401);
  });

  it('creates organization and employee records with full auditability', async () => {
    const http = request(app.getHttpServer());
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'X-Tenant-Slug': tenantSlug,
    };

    const departmentResponse = await http
      .post('/api/v1/departments')
      .set(headers)
      .send({ name: 'Engineering' })
      .expect(201);
    const departmentId = departmentResponse.body.data.id as string;
    expect(departmentId).toBeDefined();

    const employeeResponse = await http
      .post('/api/v1/employees')
      .set(headers)
      .send({
        firstName: 'Jordan',
        lastName: 'Lee',
        workEmail: 'jordan.lee@example.com',
        departmentId,
        jobProfileTitle: 'Software Engineer',
        status: 'onboarding',
      })
      .expect(201);
    const employee = employeeResponse.body.data;
    expect(employee.employeeNumber).toMatch(/^EMP-\d{6}$/);
    expect(employee.status).toBe('onboarding');
    expect(employee.title).toBe('Software Engineer');

    const listResponse = await http
      .get('/api/v1/employees')
      .set(headers)
      .query({ q: 'Jordan', page: 1, pageSize: 10 })
      .expect(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.meta.total).toBe(1);

    await http
      .patch(`/api/v1/employees/${employee.id}/status`)
      .set(headers)
      .send({ status: 'active', reason: 'Onboarding complete' })
      .expect(200)
      .expect((response) => {
        expect(response.body.data.status).toBe('active');
      });

    const contractResponse = await http
      .post('/api/v1/contracts')
      .set(headers)
      .send({
        employeeId: employee.id,
        type: 'permanent',
        startDate: '2026-01-01',
        salaryMinor: '7500000',
        currency: 'USD',
        payFrequency: 'monthly',
        workingHoursWeek: 40,
      })
      .expect(201);
    const contract = contractResponse.body.data;
    expect(contract.contractNumber).toMatch(/^CON-\d{6}$/);
    expect(contract.status).toBe('draft');
    expect(contract.salaryMinor).toBe('7500000');

    const contracts = await http
      .get('/api/v1/contracts')
      .set(headers)
      .query({ employeeId: employee.id })
      .expect(200);
    expect(contracts.body.data).toHaveLength(1);

    await http
      .patch(`/api/v1/contracts/${contract.id}`)
      .set(headers)
      .send({ status: 'active' })
      .expect(200)
      .expect((response) => {
        expect(response.body.data.status).toBe('active');
      });

    await http
      .patch(`/api/v1/contracts/${contract.id}`)
      .set(headers)
      .send({ status: 'terminated' })
      .expect(422);

    await http
      .patch(`/api/v1/contracts/${contract.id}`)
      .set(headers)
      .send({
        status: 'terminated',
        reason: 'Role eliminated',
        terminationDate: '2026-02-01',
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.data.status).toBe('terminated');
      });

    const terminatedEmployee = await http
      .get(`/api/v1/employees/${employee.id}`)
      .set(headers)
      .expect(200);
    expect(terminatedEmployee.body.data.status).toBe('terminated');
    expect(terminatedEmployee.body.data.terminationDate).toBe('2026-02-01');

    const history = await http
      .get(`/api/v1/employees/${employee.id}/history`)
      .set(headers)
      .expect(200);
    const eventTypes = history.body.data.map((event: { eventType: string }) => event.eventType);
    expect(eventTypes).toContain('contract_created');
    expect(eventTypes).toContain('contract_updated');
    expect(eventTypes).toContain('status_changed');
    const historyId = history.body.data[0].id as string;
    await http
      .patch(`/api/v1/employees/${employee.id}/history/${historyId}`)
      .set(headers)
      .send({ toValues: {} })
      .expect(404);
    await http
      .delete(`/api/v1/employees/${employee.id}/history/${historyId}`)
      .set(headers)
      .expect(404);

    const documentContent = 'employee document\n';
    const documentChecksum = createHash('sha256').update(documentContent).digest('hex');
    const presigned = await http
      .post('/api/v1/documents/presign')
      .set(headers)
      .send({
        employeeId: employee.id,
        documentType: 'other',
        fileName: 'employee-note.txt',
        mimeType: 'text/plain',
        sizeBytes: String(Buffer.byteLength(documentContent)),
        checksumSha256: documentChecksum,
      })
      .expect(201);
    const uploadUrl = new URL(presigned.body.data.uploadUrl);
    await request(app.getHttpServer())
      .put(`${uploadUrl.pathname}${uploadUrl.search}`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from(documentContent))
      .expect(200);
    const confirmedDocument = await http
      .post(`/api/v1/documents/${presigned.body.data.documentId}/confirm`)
      .set(headers)
      .send({ checksumSha256: documentChecksum })
      .expect(201);
    expect(confirmedDocument.body.data.status).toBe('clean');

    const download = await http
      .get(`/api/v1/documents/${presigned.body.data.documentId}/download`)
      .set(headers)
      .expect(200);
    const downloadUrl = new URL(download.body.data.downloadUrl);
    const downloaded = await request(app.getHttpServer())
      .get(`${downloadUrl.pathname}${downloadUrl.search}`)
      .expect(200);
    expect(downloaded.body.toString()).toBe(documentContent);

    const infectedContent = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-TEST-SIGNATURE';
    const infectedChecksum = createHash('sha256').update(infectedContent).digest('hex');
    const infectedPresign = await http
      .post('/api/v1/documents/presign')
      .set(headers)
      .send({
        employeeId: employee.id,
        documentType: 'other',
        fileName: 'infected.txt',
        mimeType: 'text/plain',
        sizeBytes: String(Buffer.byteLength(infectedContent)),
        checksumSha256: infectedChecksum,
      })
      .expect(201);
    const infectedUploadUrl = new URL(infectedPresign.body.data.uploadUrl);
    await request(app.getHttpServer())
      .put(`${infectedUploadUrl.pathname}${infectedUploadUrl.search}`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from(infectedContent))
      .expect(200);
    const infectedDocument = await http
      .post(`/api/v1/documents/${infectedPresign.body.data.documentId}/confirm`)
      .set(headers)
      .send({ checksumSha256: infectedChecksum })
      .expect(201);
    expect(infectedDocument.body.data.status).toBe('infected');
    await http
      .get(`/api/v1/documents/${infectedPresign.body.data.documentId}/download`)
      .set(headers)
      .expect(409);

    await http
      .delete(`/api/v1/documents/${presigned.body.data.documentId}`)
      .set(headers)
      .expect(200);
    await http
      .delete(`/api/v1/documents/${infectedPresign.body.data.documentId}`)
      .set(headers)
      .expect(200);

    const validCsv = [
      'employeeNumber,firstName,lastName,departmentName,status',
      'IMP-000001,Ada,Lovelace,Engineering,active',
      'IMP-000002,Grace,Hopper,,',
      '',
    ].join('\n');
    const importPresign = await http
      .post('/api/v1/imports/presign')
      .set(headers)
      .send({
        idempotencyKey: `csv-good-${suffix}`,
        mode: 'create_only',
        fileName: 'employees.csv',
      })
      .expect(201);
    const importUploadUrl = new URL(importPresign.body.data.uploadUrl);
    await request(app.getHttpServer())
      .put(`${importUploadUrl.pathname}${importUploadUrl.search}`)
      .set('Content-Type', 'text/csv')
      .send(Buffer.from(validCsv))
      .expect(200);
    const completedImport = await http
      .post(`/api/v1/imports/${importPresign.body.data.jobId}/start`)
      .set(headers)
      .expect(201);
    expect(completedImport.body.data.status).toBe('completed');
    expect(completedImport.body.data.successRows).toBe(2);
    expect(completedImport.body.data.errorRows).toBe(0);
    await http
      .post(`/api/v1/imports/${importPresign.body.data.jobId}/start`)
      .set(headers)
      .expect(201)
      .expect((response) => {
        expect(response.body.data.status).toBe('completed');
      });
    const importedEmployees = await http
      .get('/api/v1/employees')
      .set(headers)
      .query({ q: 'IMP-000001' })
      .expect(200);
    expect(importedEmployees.body.data).toHaveLength(1);

    const maliciousCsv = [
      'employeeNumber,firstName,lastName',
      'IMP-000003,=HYPERLINK("http://evil.test"),Mallory',
      '',
    ].join('\n');
    const maliciousPresign = await http
      .post('/api/v1/imports/presign')
      .set(headers)
      .send({
        idempotencyKey: `csv-malicious-${suffix}`,
        mode: 'create_only',
        fileName: 'employees-malicious.csv',
      })
      .expect(201);
    const maliciousUploadUrl = new URL(maliciousPresign.body.data.uploadUrl);
    await request(app.getHttpServer())
      .put(`${maliciousUploadUrl.pathname}${maliciousUploadUrl.search}`)
      .set('Content-Type', 'text/csv')
      .send(Buffer.from(maliciousCsv))
      .expect(200);
    const failedImport = await http
      .post(`/api/v1/imports/${maliciousPresign.body.data.jobId}/start`)
      .set(headers)
      .expect(201);
    expect(failedImport.body.data.status).toBe('failed');
    expect(failedImport.body.data.errorRows).toBeGreaterThan(0);

    const roles = await http.get('/api/v1/roles').set(headers).expect(200);
    const hrManagerRole = roles.body.data.find(
      (role: { key: string }) => role.key === 'hr_manager',
    ) as { id: string };
    await http
      .patch(`/api/v1/roles/${hrManagerRole.id}/permissions`)
      .set(headers)
      .send({
        roleId: hrManagerRole.id,
        permissionKeys: ROLE_PERMISSIONS.hr_manager.filter(
          (permission) => permission !== 'employees.view_salary',
        ),
      })
      .expect(200);

    const redactedEmail = `no-salary+${suffix}@example.com`;
    await http
      .post('/api/v1/users')
      .set(headers)
      .send({
        email: redactedEmail,
        firstName: 'No',
        lastName: 'Salary',
        roleKey: 'hr_manager',
        password: 'TestPass!2345',
      })
      .expect(201);
    const redactedLogin = await http
      .post('/api/v1/auth/login')
      .set('X-Tenant-Slug', tenantSlug)
      .send({ email: redactedEmail, password: 'TestPass!2345' })
      .expect(201);
    const redactedContracts = await http
      .get('/api/v1/contracts')
      .set({
        'X-Tenant-Slug': tenantSlug,
        Authorization: `Bearer ${redactedLogin.body.data.accessToken}`,
      })
      .query({ employeeId: employee.id })
      .expect(200);
    expect(redactedContracts.body.data).toHaveLength(1);
    expect(redactedContracts.body.data[0].salaryMinor).toBeNull();
    expect(redactedContracts.body.data[0].currency).toBeNull();

    const dashboard = await http.get('/api/v1/dashboard/summary').set(headers).expect(200);
    expect(dashboard.body.data.totalEmployees).toBe(3);
    expect(dashboard.body.data.activeDepartments).toBe(1);

    const audit = await http.get('/api/v1/audit').set(headers).expect(200);
    expect(
      audit.body.data.some((event: { action: string }) => event.action === 'employee.create'),
    ).toBe(true);
  });

  it('rejects unauthenticated access to protected routes', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('X-Tenant-Slug', 'demo')
      .expect(401);
  });
});
