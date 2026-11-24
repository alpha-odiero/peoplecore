import { createHmac, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '../../common/app-error';
import { PinoLogger } from '../../common/pino-logger.service';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly driver: 'local' | 's3';
  private readonly localRoot: string;
  private s3: S3Client | null = null;
  private readonly bucket: string;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.driver = this.config.get<'local' | 's3'>('PC_STORAGE_DRIVER') ?? 'local';
    this.localRoot = path.resolve(
      this.config.get<string>('PC_STORAGE_LOCAL_ROOT') ?? './var/storage',
    );
    this.bucket = this.config.get<string>('PC_STORAGE_BUCKET') ?? 'peoplecore';
  }

  async onModuleInit(): Promise<void> {
    if (this.driver === 'local') {
      await fs.mkdir(this.localRoot, { recursive: true });
      return;
    }
    this.s3 = new S3Client({
      region: this.config.get<string>('PC_STORAGE_REGION') ?? 'us-east-1',
      endpoint: this.config.get<string>('PC_STORAGE_ENDPOINT') || undefined,
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.get<string>('PC_STORAGE_ACCESS_KEY') ?? '',
        secretAccessKey: this.config.get<string>('PC_STORAGE_SECRET_KEY') ?? '',
      },
    });
    this.logger.info('S3 storage client initialised');
  }

  objectKey(tenantId: string, fileName: string): string {
    const safe = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${tenantId}/${Date.now()}-${safe}`;
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (this.driver === 'local') {
        await fs.access(this.localRoot);
        return true;
      }
      if (!this.s3) return false;
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: '.healthcheck' }));
      return true;
    } catch {
      return false;
    }
  }

  async createPutUrl(objectKey: string, expiresInSeconds = 300): Promise<string> {
    if (this.driver === 's3' && this.s3) {
      return getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.bucket, Key: objectKey }), {
        expiresIn: expiresInSeconds,
      });
    }
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const signature = this.signLocalUrl(objectKey, expires);
    return `${this.localUrl()}/upload/${encodeURIComponent(objectKey)}?expires=${expires}&signature=${signature}`;
  }

  async createGetUrl(objectKey: string, expiresInSeconds = 300): Promise<string> {
    if (this.driver === 's3' && this.s3) {
      return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }), {
        expiresIn: expiresInSeconds,
      });
    }
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const signature = this.signLocalUrl(objectKey, expires);
    return `${this.localUrl()}/download/${encodeURIComponent(objectKey)}?expires=${expires}&signature=${signature}`;
  }

  async objectExists(objectKey: string): Promise<boolean> {
    try {
      if (this.driver === 's3' && this.s3) {
        await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
        return true;
      }
      await fs.access(this.resolveLocalPath(objectKey));
      return true;
    } catch {
      return false;
    }
  }

  async writeLocal(objectKey: string, contents: Buffer): Promise<void> {
    if (this.driver !== 'local') {
      throw new AppError(409, 'STORAGE_DRIVER_MISMATCH', 'Local storage is not enabled');
    }
    const target = this.resolveLocalPath(objectKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents);
  }

  async readLocal(objectKey: string): Promise<Buffer> {
    if (this.driver !== 'local') {
      throw new AppError(409, 'STORAGE_DRIVER_MISMATCH', 'Local storage is not enabled');
    }
    return fs.readFile(this.resolveLocalPath(objectKey));
  }

  async readObject(objectKey: string): Promise<Buffer> {
    if (this.driver === 'local') return this.readLocal(objectKey);
    if (!this.s3) throw new AppError(409, 'STORAGE_DRIVER_UNAVAILABLE', 'Storage is not available');
    const result = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    return Buffer.from(await result.Body!.transformToByteArray());
  }

  async deleteObject(objectKey: string): Promise<void> {
    if (this.driver === 'local') {
      await fs.unlink(this.resolveLocalPath(objectKey));
      return;
    }
    if (!this.s3) throw new AppError(409, 'STORAGE_DRIVER_UNAVAILABLE', 'Storage is not available');
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }

  verifyLocalSignature(objectKey: string, expires: string, signature: string): void {
    if (!/^\d+$/.test(expires) || Number(expires) < Math.floor(Date.now() / 1000)) {
      throw new AppError(403, 'URL_EXPIRED', 'The storage URL has expired');
    }
    const expected = this.signLocalUrl(objectKey, Number(expires));
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(signature);
    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new AppError(403, 'INVALID_SIGNATURE', 'The storage URL signature is invalid');
    }
  }

  private signLocalUrl(objectKey: string, expires: number): string {
    const secret = this.config.get<string>('PC_CSRF_SECRET') ?? 'peoplecore-local-storage-secret';
    return createHmac('sha256', secret).update(`${objectKey}:${expires}`).digest('hex');
  }

  private localUrl(): string {
    return `${this.config.get<string>('PC_PUBLIC_URL') ?? 'http://localhost:3000'}/api/v1/storage`;
  }

  private resolveLocalPath(objectKey: string): string {
    const target = path.resolve(this.localRoot, objectKey);
    if (!target.startsWith(this.localRoot + path.sep)) {
      throw new AppError(400, 'INVALID_OBJECT_KEY', 'Invalid object key');
    }
    return target;
  }
}
