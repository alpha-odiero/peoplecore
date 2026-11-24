import { Injectable } from '@nestjs/common';
import {
  EMPLOYEE_STATUSES,
  type AuthenticatedUser,
  type CollectionResponse,
  type ImportJobListItem,
} from '@peoplecore/shared';
import { Prisma } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { getRequestContext } from '../../common/request-context.storage';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { StorageService } from '../../platform/storage/storage.service';
import {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  type ImportQueryDto,
  type PresignImportDto,
} from './dto/imports.dto';

type ImportJobRecord = Prisma.ImportJobGetPayload<object>;
type ImportError = { row: number; field: string; message: string };

export interface ImportPresignResponse {
  jobId: string;
  objectKey: string;
  uploadUrl: string;
  expiresIn: number;
}

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly outbox: OutboxService,
  ) {}

  async presign(
    dto: PresignImportDto,
    principal: AuthenticatedUser,
  ): Promise<ImportPresignResponse> {
    const existing = await this.prisma.importJob.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: principal.tenantId,
          idempotencyKey: dto.idempotencyKey,
        },
      },
    });
    const job =
      existing ??
      (await this.prisma.importJob.create({
        data: {
          tenantId: principal.tenantId,
          type: 'employees',
          mode: dto.mode,
          status: 'pending',
          idempotencyKey: dto.idempotencyKey,
          sourceObjectKey: this.storage.objectKey(principal.tenantId, dto.fileName),
          createdByUserId: principal.id,
        },
      }));
    return {
      jobId: job.id,
      objectKey: job.sourceObjectKey,
      uploadUrl: await this.storage.createPutUrl(job.sourceObjectKey, 300),
      expiresIn: 300,
    };
  }

  async start(id: string, principal: AuthenticatedUser): Promise<ImportJobListItem> {
    const job = await this.findRecord(id, principal);
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'running') {
      return this.toListItem(job);
    }
    if (!(await this.storage.objectExists(job.sourceObjectKey))) {
      return this.failJob(job, principal, [
        { row: 0, field: 'file', message: 'CSV object not found' },
      ]);
    }

    const contents = await this.storage.readObject(job.sourceObjectKey);
    if (contents.length > MAX_IMPORT_FILE_BYTES) {
      return this.failJob(job, principal, [
        { row: 0, field: 'file', message: 'CSV exceeds the 5 MB limit' },
      ]);
    }

    await this.prisma.importJob.update({
      where: { id },
      data: { status: 'running', startedAt: new Date(), totalRows: 0, errors: [] },
    });

    const rows = parseCsv(contents.toString('utf8'));
    if (rows.length === 0) {
      return this.failJob(job, principal, [{ row: 0, field: 'file', message: 'CSV is empty' }]);
    }
    const [header, ...dataRows] = rows;
    const errors: ImportError[] = [];
    if (dataRows.length > MAX_IMPORT_ROWS) {
      errors.push({ row: 0, field: 'file', message: 'CSV exceeds the 1000 row limit' });
    }
    const required = ['employeeNumber', 'firstName', 'lastName'];
    for (const column of required) {
      if (!header.includes(column)) {
        errors.push({ row: 0, field: column, message: `Missing required column ${column}` });
      }
    }
    if (errors.length > 0) return this.failJob(job, principal, errors);

    const parsed = dataRows.map((cells, index) => this.parseRow(header, cells, index + 2, errors));
    const seen = new Set<string>();
    for (const row of parsed) {
      if (seen.has(row.employeeNumber)) {
        errors.push({
          row: row.row,
          field: 'employeeNumber',
          message: 'Duplicate employee number in file',
        });
      }
      seen.add(row.employeeNumber);
    }
    if (errors.length > 0) return this.failJob(job, principal, errors);

    const result = await this.prisma.$transaction(async (tx) => {
      let successRows = 0;
      for (const row of parsed) {
        const department = row.departmentName
          ? await tx.department.findFirst({
              where: {
                tenantId: principal.tenantId,
                name: { equals: row.departmentName, mode: 'insensitive' },
              },
              select: { id: true },
            })
          : null;
        if (row.departmentName && !department) {
          errors.push({
            row: row.row,
            field: 'departmentName',
            message: `Unknown department ${row.departmentName}`,
          });
          continue;
        }
        const existingEmployee = await tx.employee.findFirst({
          where: { tenantId: principal.tenantId, employeeNumber: row.employeeNumber },
          select: { id: true },
        });
        if (existingEmployee && job.mode === 'create_only') {
          errors.push({
            row: row.row,
            field: 'employeeNumber',
            message: 'Employee number already exists',
          });
          continue;
        }

        const employee = existingEmployee
          ? await tx.employee.update({
              where: { id: existingEmployee.id },
              data: {
                firstName: row.firstName,
                lastName: row.lastName,
                workEmail: row.workEmail,
                status: row.status,
                departmentId: department?.id ?? null,
                updatedById: principal.id,
                version: { increment: 1 },
              },
            })
          : await tx.employee.create({
              data: {
                tenantId: principal.tenantId,
                employeeNumber: row.employeeNumber,
                firstName: row.firstName,
                lastName: row.lastName,
                workEmail: row.workEmail,
                status: row.status,
                departmentId: department?.id ?? null,
                createdById: principal.id,
                updatedById: principal.id,
              },
            });
        await tx.auditEvent.create({
          data: {
            tenantId: principal.tenantId,
            actorUserId: principal.id,
            actorType: 'user',
            action: existingEmployee ? 'employee.import_updated' : 'employee.imported',
            resourceType: 'employee',
            resourceId: employee.id,
            after: toJson({
              employeeNumber: row.employeeNumber,
              source: 'csv_import',
              jobId: job.id,
              row: row.row,
            }),
            metadata: {} as Prisma.InputJsonValue,
            correlationId: getRequestContext().correlationId || undefined,
            requestId: getRequestContext().requestId || undefined,
          },
        });
        await this.outbox.publish(
          {
            tenantId: principal.tenantId,
            eventType: existingEmployee ? 'employee.updated' : 'employee.created',
            aggregateType: 'employee',
            aggregateId: employee.id,
            payload: { source: 'csv_import', jobId: job.id, row: row.row },
          },
          tx,
        );
        successRows += 1;
      }

      if (errors.length > 0) {
        const failed = await tx.importJob.update({
          where: { id },
          data: {
            status: 'failed',
            totalRows: dataRows.length,
            successRows,
            errorRows: errors.length,
            errors: toJsonArray(errors),
            completedAt: new Date(),
          },
        });
        await this.outbox.publish(
          {
            tenantId: principal.tenantId,
            eventType: 'import.failed',
            aggregateType: 'import_job',
            aggregateId: job.id,
            payload: { errorRows: errors.length },
          },
          tx,
        );
        return failed;
      }

      const completed = await tx.importJob.update({
        where: { id },
        data: {
          status: 'completed',
          totalRows: dataRows.length,
          successRows,
          errorRows: 0,
          errors: [],
          completedAt: new Date(),
        },
      });
      await this.outbox.publish(
        {
          tenantId: principal.tenantId,
          eventType: 'import.completed',
          aggregateType: 'import_job',
          aggregateId: job.id,
          payload: { totalRows: dataRows.length, successRows },
        },
        tx,
      );
      return completed;
    });

    return this.toListItem(result);
  }

  async list(
    query: ImportQueryDto,
    principal: AuthenticatedUser,
  ): Promise<CollectionResponse<ImportJobListItem>> {
    const where: Prisma.ImportJobWhereInput = { tenantId: principal.tenantId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.importJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.importJob.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.toListItem(row)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  private parseRow(
    header: string[],
    cells: string[],
    rowNumber: number,
    errors: ImportError[],
  ): {
    row: number;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    workEmail: string | null;
    departmentName: string | null;
    status: (typeof EMPLOYEE_STATUSES)[number];
  } {
    const value = (column: string): string => {
      const index = header.indexOf(column);
      return index < 0 ? '' : (cells[index] ?? '').trim();
    };
    const employeeNumber = value('employeeNumber');
    const firstName = value('firstName');
    const lastName = value('lastName');
    const workEmail = value('workEmail') || null;
    const departmentName = value('departmentName') || null;
    const statusValue = value('status') || 'draft';

    for (const [field, cell] of Object.entries({
      employeeNumber,
      firstName,
      lastName,
      workEmail: workEmail ?? '',
      departmentName: departmentName ?? '',
      status: statusValue,
    })) {
      if (/^[=+@]/.test(cell)) {
        errors.push({ row: rowNumber, field, message: 'Formula-style values are not allowed' });
      }
    }
    if (!/^[A-Z0-9-]{3,40}$/i.test(employeeNumber)) {
      errors.push({ row: rowNumber, field: 'employeeNumber', message: 'Invalid employee number' });
    }
    if (!firstName) errors.push({ row: rowNumber, field: 'firstName', message: 'Required' });
    if (!lastName) errors.push({ row: rowNumber, field: 'lastName', message: 'Required' });
    if (workEmail && !/^\S+@\S+\.\S+$/.test(workEmail)) {
      errors.push({ row: rowNumber, field: 'workEmail', message: 'Invalid email' });
    }
    const status = EMPLOYEE_STATUSES.includes(statusValue as (typeof EMPLOYEE_STATUSES)[number])
      ? (statusValue as (typeof EMPLOYEE_STATUSES)[number])
      : 'draft';
    if (status !== statusValue) {
      errors.push({ row: rowNumber, field: 'status', message: 'Invalid employee status' });
    }
    return {
      row: rowNumber,
      employeeNumber,
      firstName,
      lastName,
      workEmail,
      departmentName,
      status,
    };
  }

  private async failJob(
    job: ImportJobRecord,
    principal: AuthenticatedUser,
    errors: ImportError[],
  ): Promise<ImportJobListItem> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.importJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorRows: errors.length,
          errors: toJsonArray(errors),
          completedAt: new Date(),
        },
      });
      await this.outbox.publish(
        {
          tenantId: principal.tenantId,
          eventType: 'import.failed',
          aggregateType: 'import_job',
          aggregateId: job.id,
          payload: { errorRows: errors.length },
        },
        tx,
      );
      return record;
    });
    return this.toListItem(updated);
  }

  private async findRecord(id: string, principal: AuthenticatedUser): Promise<ImportJobRecord> {
    const job = await this.prisma.importJob.findFirst({
      where: { AND: [{ tenantId: principal.tenantId }, { id }] },
    });
    if (!job) throw new AppError(404, 'IMPORT_JOB_NOT_FOUND', 'Import job was not found');
    return job;
  }

  private toListItem(job: ImportJobRecord): ImportJobListItem {
    return {
      id: job.id,
      type: job.type,
      mode: job.mode,
      status: job.status,
      idempotencyKey: job.idempotencyKey,
      totalRows: job.totalRows,
      successRows: job.successRows,
      errorRows: job.errorRows,
      errors: Array.isArray(job.errors)
        ? (job.errors as unknown as Array<Record<string, unknown>>)
        : [],
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
    };
  }
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (inQuotes && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
}

function toJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toJsonArray(value: ImportError[]): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
