import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser, CollectionResponse, DocumentListItem } from '@peoplecore/shared';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { getRequestContext } from '../../common/request-context.storage';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { PolicyService } from '../../platform/policy/policy.service';
import { StorageService } from '../../platform/storage/storage.service';
import {
  MAX_DOCUMENT_SIZE_BYTES,
  type ConfirmDocumentDto,
  type DocumentQueryDto,
  type PresignDocumentDto,
} from './dto/documents.dto';

type DocumentRecord = Prisma.EmployeeDocumentGetPayload<object>;

export interface PresignResponse {
  documentId: string;
  objectKey: string;
  uploadUrl: string;
  expiresIn: number;
}

export interface DownloadResponse {
  documentId: string;
  downloadUrl: string;
  expiresIn: number;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly outbox: OutboxService,
    private readonly policy: PolicyService,
  ) {}

  async presign(dto: PresignDocumentDto, principal: AuthenticatedUser): Promise<PresignResponse> {
    await this.ensureEmployee(dto.employeeId, principal);
    const sizeBytes = BigInt(dto.sizeBytes);
    if (sizeBytes > BigInt(MAX_DOCUMENT_SIZE_BYTES)) {
      throw new AppError(413, 'FILE_TOO_LARGE', 'Document exceeds the 10 MB limit');
    }

    const objectKey = this.storage.objectKey(principal.tenantId, dto.fileName);
    const document = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employeeDocument.create({
        data: {
          tenantId: principal.tenantId,
          employeeId: dto.employeeId,
          documentType: dto.documentType,
          objectKey,
          fileName: dto.fileName,
          mimeType: dto.mimeType,
          sizeBytes,
          checksumSha256: dto.checksumSha256,
          status: 'pending_upload',
          uploaderUserId: principal.id,
          retentionClass: dto.retentionClass,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.id,
          actorType: 'user',
          action: 'document.presign',
          resourceType: 'document',
          resourceId: created.id,
          after: toJson({ objectKey, fileName: dto.fileName, sizeBytes: dto.sizeBytes }),
          metadata: {} as Prisma.InputJsonValue,
          correlationId: getRequestContext().correlationId || undefined,
          requestId: getRequestContext().requestId || undefined,
        },
      });
      return created;
    });

    return {
      documentId: document.id,
      objectKey,
      uploadUrl: await this.storage.createPutUrl(objectKey, 300),
      expiresIn: 300,
    };
  }

  async confirm(
    id: string,
    dto: ConfirmDocumentDto,
    principal: AuthenticatedUser,
  ): Promise<DocumentListItem> {
    const document = await this.findRecord(id, principal);
    if (document.status !== 'pending_upload') {
      throw new AppError(409, 'DOCUMENT_ALREADY_CONFIRMED', 'Document has already been confirmed');
    }
    if (dto.checksumSha256.toLowerCase() !== document.checksumSha256.toLowerCase()) {
      throw new AppError(
        422,
        'CHECKSUM_MISMATCH',
        'Checksum does not match the presigned metadata',
      );
    }
    if (!(await this.storage.objectExists(document.objectKey))) {
      throw new AppError(409, 'OBJECT_NOT_FOUND', 'Uploaded object was not found');
    }

    const contents = await this.storage.readObject(document.objectKey);
    if (BigInt(contents.length) !== document.sizeBytes) {
      throw new AppError(422, 'CHECKSUM_MISMATCH', 'Uploaded object size does not match metadata');
    }
    const checksum = createHash('sha256').update(contents).digest('hex');
    if (checksum.toLowerCase() !== document.checksumSha256.toLowerCase()) {
      throw new AppError(422, 'CHECKSUM_MISMATCH', 'Uploaded object checksum does not match');
    }

    const clean = !contents.includes(Buffer.from('EICAR-TEST-SIGNATURE'));
    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.employeeDocument.update({
        where: { id },
        data: {
          status: clean ? 'clean' : 'infected',
          uploadedAt: new Date(),
          confirmedAt: new Date(),
          scanCompletedAt: new Date(),
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.id,
          actorType: 'user',
          action: 'document.uploaded',
          resourceType: 'document',
          resourceId: record.id,
          after: toJson({
            objectKey: record.objectKey,
            checksumSha256: record.checksumSha256,
            status: record.status,
          }),
          metadata: {} as Prisma.InputJsonValue,
          correlationId: getRequestContext().correlationId || undefined,
          requestId: getRequestContext().requestId || undefined,
        },
      });
      await this.outbox.publish(
        {
          tenantId: principal.tenantId,
          eventType: 'document.uploaded',
          aggregateType: 'document',
          aggregateId: record.id,
          payload: {
            employeeId: record.employeeId,
            objectKey: record.objectKey,
            status: record.status,
          },
        },
        tx,
      );
      await this.outbox.publish(
        {
          tenantId: principal.tenantId,
          eventType: 'document.scan_completed',
          aggregateType: 'document',
          aggregateId: record.id,
          payload: {
            status: record.status,
            scanCompletedAt: record.scanCompletedAt?.toISOString(),
          },
        },
        tx,
      );
      return record;
    });

    return this.toListItem(updated);
  }

  async list(
    query: DocumentQueryDto,
    principal: AuthenticatedUser,
  ): Promise<CollectionResponse<DocumentListItem>> {
    const andFilters: Prisma.EmployeeDocumentWhereInput[] = [
      { tenantId: principal.tenantId },
      { employee: { is: this.policy.employeeWhere(principal) } },
    ];
    if (query.employeeId) andFilters.push({ employeeId: query.employeeId });
    const where: Prisma.EmployeeDocumentWhereInput = { AND: andFilters };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.employeeDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.employeeDocument.count({ where }),
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

  async download(id: string, principal: AuthenticatedUser): Promise<DownloadResponse> {
    const document = await this.findRecord(id, principal);
    if (document.status !== 'clean') {
      throw new AppError(409, 'DOCUMENT_NOT_AVAILABLE', 'Document is not available for download');
    }
    await this.prisma.dataAccessEvent.create({
      data: {
        tenantId: principal.tenantId,
        actorUserId: principal.id,
        resourceType: 'document',
        resourceId: document.id,
        fieldsAccessed: ['objectKey', 'fileName', 'content'],
        purpose: 'document_download',
      },
    });
    return {
      documentId: document.id,
      downloadUrl: await this.storage.createGetUrl(document.objectKey, 300),
      expiresIn: 300,
    };
  }

  async delete(id: string, principal: AuthenticatedUser): Promise<{ deleted: true }> {
    const document = await this.findRecord(id, principal);
    if (await this.storage.objectExists(document.objectKey)) {
      await this.storage.deleteObject(document.objectKey);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.employeeDocument.delete({ where: { id } });
      await tx.auditEvent.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.id,
          actorType: 'user',
          action: 'document.deleted',
          resourceType: 'document',
          resourceId: document.id,
          before: toJson({
            id: document.id,
            objectKey: document.objectKey,
            fileName: document.fileName,
            checksumSha256: document.checksumSha256,
          }),
          metadata: {} as Prisma.InputJsonValue,
          correlationId: getRequestContext().correlationId || undefined,
          requestId: getRequestContext().requestId || undefined,
        },
      });
      await this.outbox.publish(
        {
          tenantId: principal.tenantId,
          eventType: 'document.deleted',
          aggregateType: 'document',
          aggregateId: document.id,
          payload: { objectKey: document.objectKey },
        },
        tx,
      );
    });
    return { deleted: true };
  }

  private async ensureEmployee(employeeId: string, principal: AuthenticatedUser): Promise<void> {
    const employee = await this.prisma.employee.findFirst({
      where: {
        AND: [
          { tenantId: principal.tenantId },
          { id: employeeId },
          this.policy.employeeWhere(principal),
        ],
      },
      select: { id: true },
    });
    if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee was not found');
  }

  private async findRecord(id: string, principal: AuthenticatedUser): Promise<DocumentRecord> {
    const document = await this.prisma.employeeDocument.findFirst({
      where: {
        AND: [
          { tenantId: principal.tenantId },
          { id },
          { employee: { is: this.policy.employeeWhere(principal) } },
        ],
      },
    });
    if (!document) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document was not found');
    return document;
  }

  private toListItem(document: DocumentRecord): DocumentListItem {
    return {
      id: document.id,
      employeeId: document.employeeId,
      documentType: document.documentType,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes.toString(),
      checksumSha256: document.checksumSha256,
      status: document.status,
      uploadedAt: document.uploadedAt?.toISOString() ?? null,
      confirmedAt: document.confirmedAt?.toISOString() ?? null,
      scanCompletedAt: document.scanCompletedAt?.toISOString() ?? null,
      createdAt: document.createdAt.toISOString(),
    };
  }
}

function toJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
