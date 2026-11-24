import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { requestContextStorage } from './request-context.storage';

function tenantSlugFromHost(host: string | undefined): string | undefined {
  if (!host) return undefined;
  const hostname = host.split(':')[0]?.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') return undefined;
  const parts = hostname.split('.');
  if (parts.length < 3) return undefined;
  const subdomain = parts[0];
  return ['www', 'api', 'app'].includes(subdomain ?? '') ? undefined : subdomain;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = req.header('x-request-id') || randomUUID();
    const correlationId = req.header('x-correlation-id') || requestId;
    const tenantSlug =
      req.header('x-tenant-slug')?.toLowerCase() || tenantSlugFromHost(req.header('host'));

    const context = {
      requestId,
      correlationId,
      tenantSlug,
      permissions: [],
      roles: [],
      scopes: [],
      ip: req.ip,
      userAgent: req.header('user-agent'),
    };

    res.setHeader('x-request-id', requestId);
    requestContextStorage.run(context, () => next());
  }
}
