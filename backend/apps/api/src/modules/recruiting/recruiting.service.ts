import { Injectable } from '@nestjs/common';
import { CandidateStage, EmploymentType, OfferStatus, Prisma, VacancyStatus } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import type {
  ApplicationQueryDto,
  CreateApplicationDto,
  CreateCandidateDto,
  CreateOfferDto,
  CreateVacancyDto,
  ScheduleInterviewDto,
  UpdateApplicationStageDto,
} from './dto/recruiting.dto';

const STAGES = Object.values(CandidateStage);

@Injectable()
export class RecruitingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  createVacancy(tenantId: string, dto: CreateVacancyDto) {
    return this.prisma.jobVacancy
      .create({
        data: {
          tenantId,
          code: dto.code.toUpperCase(),
          title: dto.title,
          departmentId: dto.departmentId,
          locationId: dto.locationId,
          employmentType:
            (dto.employmentType as EmploymentType | undefined) ?? EmploymentType.full_time,
          salaryMinMinor: dto.salaryMinMinor ? BigInt(dto.salaryMinMinor) : null,
          salaryMaxMinor: dto.salaryMaxMinor ? BigInt(dto.salaryMaxMinor) : null,
          currency: dto.currency,
          description: dto.description,
          status: VacancyStatus.open,
        },
      })
      .then(serializeVacancy);
  }

  listVacancies(tenantId: string) {
    return this.prisma.jobVacancy
      .findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } })
      .then((rows) => rows.map(serializeVacancy));
  }

  createCandidate(tenantId: string, dto: CreateCandidateDto) {
    return this.prisma.candidate.create({
      data: {
        tenantId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        source: dto.source,
      },
    });
  }

  listCandidates(tenantId: string) {
    return this.prisma.candidate.findMany({
      where: { tenantId },
      include: { applications: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async apply(tenantId: string, userId: string, dto: CreateApplicationDto) {
    const vacancy = await this.prisma.jobVacancy.findFirst({
      where: { id: dto.vacancyId, tenantId },
    });
    if (!vacancy) throw new AppError(404, 'VACANCY_NOT_FOUND', 'Vacancy was not found');
    if (vacancy.status !== VacancyStatus.open) {
      throw new AppError(409, 'VACANCY_CLOSED', 'Vacancy is not open');
    }
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: dto.candidateId, tenantId },
    });
    if (!candidate) throw new AppError(404, 'CANDIDATE_NOT_FOUND', 'Candidate was not found');
    const application = await this.prisma.application.create({
      data: {
        tenantId,
        vacancyId: dto.vacancyId,
        candidateId: dto.candidateId,
        notes: dto.notes,
      },
    });
    await this.audit.write({
      tenantId,
      actorUserId: userId,
      action: 'recruiting.application_created',
      resourceType: 'application',
      resourceId: application.id,
      after: { vacancyId: dto.vacancyId, candidateId: dto.candidateId },
    });
    return application;
  }

  listApplications(tenantId: string, query: ApplicationQueryDto) {
    const where: Prisma.ApplicationWhereInput = {
      tenantId,
      ...(query.vacancyId ? { vacancyId: query.vacancyId } : {}),
      ...(query.stage && STAGES.includes(query.stage as CandidateStage)
        ? { stage: query.stage as CandidateStage }
        : {}),
    };
    return this.prisma.application.findMany({
      where,
      include: {
        candidate: true,
        vacancy: { select: { id: true, title: true, code: true } },
        interviews: { orderBy: { scheduledAt: 'asc' } },
        offers: true,
      },
      orderBy: { appliedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
  }

  async updateStage(tenantId: string, userId: string, id: string, dto: UpdateApplicationStageDto) {
    const stage = dto.stage as CandidateStage;
    if (!STAGES.includes(stage))
      throw new AppError(422, 'INVALID_STAGE', 'Invalid candidate stage');
    const application = await this.prisma.application.findFirst({ where: { id, tenantId } });
    if (!application) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application was not found');
    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        stage,
        rating: dto.rating,
        notes: dto.notes ?? application.notes,
      },
    });
    await this.audit.write({
      tenantId,
      actorUserId: userId,
      action: 'recruiting.stage_changed',
      resourceType: 'application',
      resourceId: id,
      after: { stage },
    });
    return updated;
  }

  async scheduleInterview(tenantId: string, id: string, dto: ScheduleInterviewDto) {
    const application = await this.prisma.application.findFirst({ where: { id, tenantId } });
    if (!application) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application was not found');
    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime()))
      throw new AppError(422, 'INVALID_DATE', 'Invalid interview date');
    await this.prisma.application.update({
      where: { id },
      data: { stage: CandidateStage.interview },
    });
    return this.prisma.interview.create({
      data: {
        tenantId,
        applicationId: id,
        scheduledAt,
        interviewerUserId: dto.interviewerUserId,
        notes: dto.notes,
      },
    });
  }

  async createOffer(tenantId: string, id: string, dto: CreateOfferDto) {
    const application = await this.prisma.application.findFirst({ where: { id, tenantId } });
    if (!application) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application was not found');
    const offer = await this.prisma.jobOffer.upsert({
      where: { tenantId_applicationId: { tenantId, applicationId: id } },
      update: {
        salaryMinor: BigInt(dto.salaryMinor),
        currency: dto.currency,
        startDate: new Date(dto.startDate),
        status: OfferStatus.sent,
      },
      create: {
        tenantId,
        applicationId: id,
        salaryMinor: BigInt(dto.salaryMinor),
        currency: dto.currency,
        startDate: new Date(dto.startDate),
        status: OfferStatus.sent,
      },
    });
    await this.prisma.application.update({
      where: { id },
      data: { stage: CandidateStage.offer },
    });
    return serializeOffer(offer);
  }

  async acceptOffer(tenantId: string, userId: string, id: string) {
    const offer = await this.prisma.jobOffer.findFirst({
      where: { id, tenantId },
      include: { application: { include: { candidate: true, vacancy: true } } },
    });
    if (!offer) throw new AppError(404, 'OFFER_NOT_FOUND', 'Offer was not found');
    if (offer.status === OfferStatus.accepted) {
      throw new AppError(409, 'OFFER_ALREADY_ACCEPTED', 'Offer was already accepted');
    }
    const candidate = offer.application.candidate;
    const existing = await this.prisma.employee.findFirst({
      where: { tenantId, workEmail: candidate.email.toLowerCase() },
    });
    if (existing)
      throw new AppError(409, 'EMPLOYEE_EXISTS', 'An employee with this email already exists');

    const employeeNumber = await this.nextEmployeeNumber(tenantId);
    const employee = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          tenantId,
          employeeNumber,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          workEmail: candidate.email.toLowerCase(),
          status: 'onboarding',
          employmentType: offer.application.vacancy.employmentType,
          departmentId: offer.application.vacancy.departmentId,
          locationId: offer.application.vacancy.locationId,
          hireDate: offer.startDate,
          createdById: userId,
          updatedById: userId,
        },
      });
      await tx.jobOffer.update({ where: { id }, data: { status: OfferStatus.accepted } });
      await tx.application.update({
        where: { id: offer.applicationId },
        data: { stage: CandidateStage.hired },
      });
      await this.audit.write({
        tenantId,
        actorUserId: userId,
        action: 'recruiting.candidate_hired',
        resourceType: 'employee',
        resourceId: created.id,
        after: { offerId: id, applicationId: offer.applicationId, employeeNumber },
      });
      await this.outbox.publish(
        {
          tenantId,
          eventType: 'recruiting.candidate_hired',
          aggregateType: 'employee',
          aggregateId: created.id,
          payload: {
            subject: 'Candidate hired',
            message: `${candidate.firstName} ${candidate.lastName} was hired`,
            employeeId: created.id,
          },
        },
        tx,
      );
      return created;
    });
    return employee;
  }

  private async nextEmployeeNumber(tenantId: string): Promise<string> {
    let sequence = (await this.prisma.employee.count({ where: { tenantId } })) + 1;
    while (true) {
      const employeeNumber = `EMP-${String(sequence).padStart(6, '0')}`;
      const existing = await this.prisma.employee.findUnique({
        where: { tenantId_employeeNumber: { tenantId, employeeNumber } },
      });
      if (!existing) return employeeNumber;
      sequence += 1;
    }
  }
}

function serializeVacancy(row: {
  id: string;
  tenantId: string;
  code: string;
  title: string;
  departmentId: string | null;
  locationId: string | null;
  employmentType: string;
  salaryMinMinor: bigint | null;
  salaryMaxMinor: bigint | null;
  currency: string | null;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...row,
    salaryMinMinor: row.salaryMinMinor?.toString() ?? null,
    salaryMaxMinor: row.salaryMaxMinor?.toString() ?? null,
  };
}

function serializeOffer(row: {
  id: string;
  tenantId: string;
  applicationId: string;
  salaryMinor: bigint;
  currency: string;
  startDate: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...row,
    salaryMinor: row.salaryMinor.toString(),
    startDate: row.startDate.toISOString(),
  };
}
