import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import type {
  AttendanceQueryDto,
  AttendanceSummaryQueryDto,
  ClockInDto,
  ClockOutDto,
  CreateAttendanceDto,
} from './dto/attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async clockIn(tenantId: string, userId: string, dto: ClockInDto) {
    const employeeId = await this.resolveEmployee(tenantId, userId, dto.employeeId);
    const at = dto.at ? new Date(dto.at) : new Date();
    if (Number.isNaN(at.getTime()))
      throw new AppError(422, 'INVALID_TIME', 'Invalid clock-in time');
    const workDate = dateOnly(at);
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { tenantId_employeeId_workDate: { tenantId, employeeId, workDate } },
    });
    if (existing?.clockIn) {
      throw new AppError(409, 'ALREADY_CLOCKED_IN', 'Employee is already clocked in');
    }
    const record = await this.prisma.attendanceRecord.upsert({
      where: { tenantId_employeeId_workDate: { tenantId, employeeId, workDate } },
      update: { clockIn: at, source: 'self_service' },
      create: { tenantId, employeeId, workDate, clockIn: at, source: 'self_service' },
    });
    await this.audit.write({
      tenantId,
      actorUserId: userId,
      action: 'attendance.clock_in',
      resourceType: 'attendance_record',
      resourceId: record.id,
      after: { employeeId, at: at.toISOString() },
    });
    return record;
  }

  async clockOut(tenantId: string, userId: string, dto: ClockOutDto) {
    const employeeId = await this.resolveEmployee(tenantId, userId, dto.employeeId);
    const at = dto.at ? new Date(dto.at) : new Date();
    if (Number.isNaN(at.getTime()))
      throw new AppError(422, 'INVALID_TIME', 'Invalid clock-out time');
    const workDate = dateOnly(at);
    const record = await this.prisma.attendanceRecord.findUnique({
      where: { tenantId_employeeId_workDate: { tenantId, employeeId, workDate } },
    });
    if (!record?.clockIn) throw new AppError(409, 'NOT_CLOCKED_IN', 'Employee has not clocked in');
    if (at < record.clockIn)
      throw new AppError(422, 'INVALID_TIME', 'Clock-out must be after clock-in');
    const updated = await this.prisma.attendanceRecord.update({
      where: { id: record.id },
      data: { clockOut: at },
    });
    await this.audit.write({
      tenantId,
      actorUserId: userId,
      action: 'attendance.clock_out',
      resourceType: 'attendance_record',
      resourceId: record.id,
      after: { employeeId, at: at.toISOString() },
    });
    return updated;
  }

  async create(tenantId: string, userId: string, dto: CreateAttendanceDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, tenantId },
    });
    if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee was not found');
    const clockIn = new Date(dto.clockIn);
    const clockOut = dto.clockOut ? new Date(dto.clockOut) : null;
    if (Number.isNaN(clockIn.getTime()) || (clockOut && Number.isNaN(clockOut.getTime()))) {
      throw new AppError(422, 'INVALID_TIME', 'Invalid attendance time');
    }
    if (clockOut && clockOut < clockIn) {
      throw new AppError(422, 'INVALID_TIME', 'Clock-out must be after clock-in');
    }
    const record = await this.prisma.attendanceRecord.upsert({
      where: {
        tenantId_employeeId_workDate: {
          tenantId,
          employeeId: dto.employeeId,
          workDate: new Date(dto.workDate),
        },
      },
      update: {
        clockIn,
        clockOut,
        breakMinutes: dto.breakMinutes ?? 0,
        source: 'manual',
        note: dto.note,
      },
      create: {
        tenantId,
        employeeId: dto.employeeId,
        workDate: new Date(dto.workDate),
        clockIn,
        clockOut,
        breakMinutes: dto.breakMinutes ?? 0,
        source: 'manual',
        note: dto.note,
      },
    });
    await this.audit.write({
      tenantId,
      actorUserId: userId,
      action: 'attendance.record',
      resourceType: 'attendance_record',
      resourceId: record.id,
      after: { employeeId: dto.employeeId, workDate: dto.workDate },
    });
    return record;
  }

  list(tenantId: string, query: AttendanceQueryDto) {
    const where: Prisma.AttendanceRecordWhereInput = {
      tenantId,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.from || query.to
        ? {
            workDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    return this.prisma.attendanceRecord.findMany({
      where,
      include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } } },
      orderBy: { workDate: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
  }

  async summary(tenantId: string, query: AttendanceSummaryQueryDto) {
    const rows = await this.prisma.attendanceRecord.findMany({
      where: {
        tenantId,
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        workDate: { gte: new Date(query.from), lte: new Date(query.to) },
      },
      include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } } },
      orderBy: [{ employeeId: 'asc' }, { workDate: 'asc' }],
    });
    const grouped = new Map<
      string,
      {
        employeeId: string;
        employee: (typeof rows)[number]['employee'];
        days: number;
        hours: number;
        minutes: number;
      }
    >();
    for (const row of rows) {
      const entry = grouped.get(row.employeeId) ?? {
        employeeId: row.employeeId,
        employee: row.employee,
        days: 0,
        hours: 0,
        minutes: 0,
      };
      if (row.clockIn && row.clockOut) {
        entry.days += 1;
        entry.minutes += Math.max(
          0,
          Math.round((row.clockOut.getTime() - row.clockIn.getTime()) / 60000) - row.breakMinutes,
        );
      }
      grouped.set(row.employeeId, entry);
    }
    return [...grouped.values()].map((entry) => ({
      ...entry,
      hours: Math.round((entry.minutes / 60) * 100) / 100,
    }));
  }

  private async resolveEmployee(tenantId: string, userId: string, employeeId?: string) {
    if (employeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: { id: employeeId, tenantId },
      });
      if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee was not found');
      return employeeId;
    }
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { employeeId: true },
    });
    if (!user?.employeeId) {
      throw new AppError(422, 'EMPLOYEE_REQUIRED', 'Current user has no linked employee');
    }
    return user.employeeId;
  }
}

function dateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
