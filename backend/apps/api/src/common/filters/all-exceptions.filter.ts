import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError } from '../app-error';
import { PinoLogger } from '../pino-logger.service';
import { getRequestContext } from '../request-context.storage';

const STATUS_TITLES: Record<number, string> = {
  400: 'Bad request',
  401: 'Unauthenticated',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  422: 'Validation failed',
  429: 'Too many requests',
  500: 'Internal server error',
  503: 'Service unavailable',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly fallbackLogger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const context = getRequestContext();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let detail = 'An unexpected error occurred';
    let fieldErrors: Array<{ field: string; message: string }> | undefined;

    if (exception instanceof AppError) {
      status = exception.status;
      code = exception.code;
      detail = exception.message;
      fieldErrors = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = this.codeFromHttpStatus(status);
      const body = exception.getResponse();
      detail =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message?.toString() ?? exception.message);
      if (typeof body === 'object' && Array.isArray((body as { errors?: unknown }).errors)) {
        fieldErrors = (body as { errors: Array<{ field: string; message: string }> }).errors;
      }
    } else {
      const prisma = exception as { code?: string; meta?: unknown };
      if (prisma.code === 'P2002') {
        status = 409;
        code = 'DUPLICATE_KEY';
        detail = 'A record with the same unique value already exists';
      } else if (prisma.code === 'P2025') {
        status = 404;
        code = 'RESOURCE_NOT_FOUND';
        detail = 'Resource was not found';
      } else if (prisma.code === 'P2034') {
        status = 409;
        code = 'VERSION_CONFLICT';
        detail = 'The record changed before the operation completed';
      } else if (errorHasMessage(exception) && process.env.NODE_ENV !== 'production') {
        detail = exception.message;
      }
    }

    if (status >= 500) {
      this.logger.error(
        { err: serializeError(exception), path: request.originalUrl, method: request.method },
        'unhandled exception',
      );
    } else {
      this.fallbackLogger.debug(`${status} ${request.method} ${request.originalUrl}: ${detail}`);
    }

    response.status(status).json({
      type: `https://peoplecore.app/problems/${code}`,
      title: STATUS_TITLES[status] ?? 'Error',
      status,
      detail,
      instance: request.originalUrl,
      requestId: context.requestId || 'unknown',
      code,
      ...(fieldErrors ? { errors: fieldErrors } : {}),
    });
  }

  private codeFromHttpStatus(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHENTICATED',
      403: 'FORBIDDEN',
      404: 'RESOURCE_NOT_FOUND',
      409: 'CONFLICT',
      422: 'VALIDATION_FAILED',
      429: 'RATE_LIMITED',
      503: 'SERVICE_UNAVAILABLE',
    };
    return map[status] ?? 'HTTP_ERROR';
  }
}

function errorHasMessage(error: unknown): error is Error {
  return error instanceof Error;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { value: String(error) };
}
