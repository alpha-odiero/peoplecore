import 'dotenv/config';
import { PrismaClient, type Prisma } from '@prisma/client';
import { hash } from 'argon2';
import {
  PERMISSIONS,
  PERMISSION_CATEGORY_BY_PREFIX,
  ROLE_PERMISSIONS,
  type RoleKey,
} from '@peoplecore/shared';

const prisma = new PrismaClient();

const ROLE_NAMES: Record<RoleKey, string> = {
  tenant_admin: 'Tenant Admin',
  hr_admin: 'HR Admin',
  hr_manager: 'HR Manager',
  manager: 'Manager',
  employee: 'Employee',
  auditor: 'Auditor',
};

async function main(): Promise<void> {
  const slug = process.env.PC_DEFAULT_TENANT_SLUG ?? 'demo';
  const adminEmail = process.env.PC_DEFAULT_ADMIN_EMAIL ?? 'admin@peoplecore.local';
  const adminPassword = process.env.PC_DEFAULT_ADMIN_PASSWORD ?? 'ChangeMe!2345';

  for (const permission of PERMISSIONS) {
    const prefix = permission.split('.')[0] ?? 'other';
    await prisma.permission.upsert({
      where: { key: permission },
      update: { category: PERMISSION_CATEGORY_BY_PREFIX[prefix] ?? 'Other' },
      create: {
        key: permission,
        category: PERMISSION_CATEGORY_BY_PREFIX[prefix] ?? 'Other',
        description: `${permission} access`,
      },
    });
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: {
      name: process.env.PC_DEFAULT_TENANT_NAME ?? 'PeopleCore Demo',
      status: 'active',
    },
    create: {
      slug,
      name: process.env.PC_DEFAULT_TENANT_NAME ?? 'PeopleCore Demo',
      defaultTimezone: 'UTC',
      defaultCurrency: 'USD',
      settings: { seeded: true },
    },
  });

  const roles = new Map<RoleKey, string>();
  for (const key of Object.keys(ROLE_PERMISSIONS) as RoleKey[]) {
    const role = await prisma.role.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key } },
      update: { name: ROLE_NAMES[key], isSystem: true },
      create: { tenantId: tenant.id, key, name: ROLE_NAMES[key], isSystem: true },
    });
    roles.set(key, role.id);

    for (const permissionKey of ROLE_PERMISSIONS[key]) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { key: permissionKey },
      });
      await prisma.rolePermission.upsert({
        where: {
          tenantId_roleId_permissionId: {
            tenantId: tenant.id,
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: { tenantId: tenant.id, roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const engineering = await prisma.department.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'ENG' } },
    update: { name: 'Engineering' },
    create: { tenantId: tenant.id, code: 'ENG', name: 'Engineering', costCenter: 'CC-100' },
  });
  const people = await prisma.department.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'People' } },
    update: { name: 'People & Culture' },
    create: { tenantId: tenant.id, code: 'People', name: 'People & Culture', costCenter: 'CC-200' },
  });
  const sales = await prisma.department.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'Sales' } },
    update: { name: 'Sales' },
    create: { tenantId: tenant.id, code: 'Sales', name: 'Sales', costCenter: 'CC-300' },
  });

  const employeeSeeds = [
    {
      number: 'EMP-000001',
      first: 'Avery',
      last: 'Morgan',
      email: 'avery.morgan@example.com',
      status: 'active' as const,
      dept: engineering.id,
      title: 'Engineering Lead',
    },
    {
      number: 'EMP-000002',
      first: 'Jordan',
      last: 'Lee',
      email: 'jordan.lee@example.com',
      status: 'active' as const,
      dept: engineering.id,
      title: 'Software Engineer',
    },
    {
      number: 'EMP-000003',
      first: 'Riley',
      last: 'Chen',
      email: 'riley.chen@example.com',
      status: 'onboarding' as const,
      dept: people.id,
      title: 'HR Specialist',
    },
    {
      number: 'EMP-000004',
      first: 'Casey',
      last: 'Patel',
      email: 'casey.patel@example.com',
      status: 'on_leave' as const,
      dept: sales.id,
      title: 'Account Executive',
    },
    {
      number: 'EMP-000005',
      first: 'Morgan',
      last: 'Davis',
      email: 'morgan.davis@example.com',
      status: 'active' as const,
      dept: people.id,
      title: 'People Manager',
    },
  ];

  const employeeIds = new Map<string, string>();
  for (const seed of employeeSeeds) {
    const employee = await prisma.employee.upsert({
      where: { tenantId_employeeNumber: { tenantId: tenant.id, employeeNumber: seed.number } },
      update: {
        firstName: seed.first,
        lastName: seed.last,
        workEmail: seed.email,
        status: seed.status,
        departmentId: seed.dept,
      },
      create: {
        tenantId: tenant.id,
        employeeNumber: seed.number,
        firstName: seed.first,
        lastName: seed.last,
        workEmail: seed.email,
        status: seed.status,
        employmentType: 'full_time',
        departmentId: seed.dept,
        hireDate: new Date('2025-01-15'),
        version: 1,
      },
    });
    employeeIds.set(seed.number, employee.id);
    const historyCount = await prisma.employmentHistory.count({
      where: { tenantId: tenant.id, employeeId: employee.id, eventType: 'created' },
    });
    if (historyCount === 0) {
      await prisma.employmentHistory.create({
        data: {
          tenantId: tenant.id,
          employeeId: employee.id,
          eventType: 'created',
          toValues: { employeeNumber: seed.number, title: seed.title } as Prisma.JsonObject,
          effectiveAt: new Date('2025-01-15T00:00:00.000Z'),
        },
      });
    }
  }

  const currentYear = new Date().getUTCFullYear();
  for (const seed of [
    { code: 'ANNUAL', name: 'Annual leave', allowance: 20, accrual: 1.67, carryOver: true },
    { code: 'SICK', name: 'Sick leave', allowance: 10, accrual: 0.83, carryOver: false },
  ]) {
    const leaveType = await prisma.leaveType.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: seed.code } },
      update: {
        name: seed.name,
        annualAllowanceDays: seed.allowance,
        accrualPerMonthDays: seed.accrual,
      },
      create: {
        tenantId: tenant.id,
        code: seed.code,
        name: seed.name,
        annualAllowanceDays: seed.allowance,
        accrualPerMonthDays: seed.accrual,
        carryOverAllowed: seed.carryOver,
      },
    });
    for (const employeeId of employeeIds.values()) {
      await prisma.leaveBalance.upsert({
        where: {
          tenantId_employeeId_leaveTypeId_year: {
            tenantId: tenant.id,
            employeeId,
            leaveTypeId: leaveType.id,
            year: currentYear,
          },
        },
        update: { allowanceDays: seed.allowance },
        create: {
          tenantId: tenant.id,
          employeeId,
          leaveTypeId: leaveType.id,
          year: currentYear,
          allowanceDays: seed.allowance,
        },
      });
    }
  }

  const adminEmployeeId = employeeIds.get('EMP-000001');
  if (!adminEmployeeId) throw new Error('Seed employee missing');

  await prisma.department.update({
    where: { id: engineering.id },
    data: { managerEmployeeId: adminEmployeeId },
  });

  const passwordHash = await hash(adminPassword, {
    type: 2,
    memoryCost: 19_456,
    timeCost: 3,
    parallelism: 1,
  });

  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
    update: { status: 'active', passwordHash, employeeId: adminEmployeeId },
    create: {
      tenantId: tenant.id,
      email: adminEmail,
      passwordHash,
      firstName: 'Avery',
      lastName: 'Morgan',
      status: 'active',
      employeeId: adminEmployeeId,
      permissionVersion: 1,
    },
  });

  const adminRoleId = roles.get('tenant_admin');
  if (!adminRoleId) throw new Error('Admin role missing');
  const existingUserRole = await prisma.userRole.findFirst({
    where: { tenantId: tenant.id, userId: admin.id, roleId: adminRoleId, scopeType: 'tenant' },
  });
  if (!existingUserRole) {
    await prisma.userRole.create({
      data: {
        tenantId: tenant.id,
        userId: admin.id,
        roleId: adminRoleId,
        scopeType: 'tenant',
      },
    });
  }

  const auditCount = await prisma.auditEvent.count({
    where: { tenantId: tenant.id, action: 'system.seed' },
  });
  if (auditCount === 0) {
    await prisma.auditEvent.create({
      data: {
        tenantId: tenant.id,
        actorType: 'system',
        action: 'system.seed',
        resourceType: 'tenant',
        resourceId: tenant.id,
        after: { tenant: tenant.slug, employees: employeeSeeds.length } as Prisma.JsonObject,
        metadata: {} as Prisma.JsonObject,
      },
    });
  }

  process.stdout.write(
    `Seeded tenant ${tenant.slug}, ${employeeSeeds.length} employees, admin ${adminEmail}\n`,
  );
}

main()
  .catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
