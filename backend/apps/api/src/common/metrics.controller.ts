import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { register } from 'prom-client';
import { Public } from './decorators/public.decorator';
import { RawResponse } from './decorators/raw-response.decorator';

@ApiExcludeController()
@Public()
@Controller('metrics')
export class MetricsController {
  @Get()
  @RawResponse()
  async metrics(@Res() response: Response): Promise<void> {
    response.setHeader('Content-Type', register.contentType);
    response.send(await register.metrics());
  }
}
