import { Controller, Get, Param, Put, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { StorageService } from './storage.service';

@ApiTags('Storage')
@Public()
@RawResponse()
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Put('upload/:objectKey')
  async upload(
    @Param('objectKey') objectKey: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Req() request: Request,
  ): Promise<{ stored: true }> {
    this.storage.verifyLocalSignature(objectKey, expires, signature);
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    await this.storage.writeLocal(objectKey, Buffer.concat(chunks));
    return { stored: true };
  }

  @Get('download/:objectKey')
  async download(
    @Param('objectKey') objectKey: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Res() response: Response,
  ): Promise<void> {
    this.storage.verifyLocalSignature(objectKey, expires, signature);
    const contents = await this.storage.readLocal(objectKey);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${objectKey.split('/').pop()}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(contents);
  }
}
