import { z } from 'zod';

const booleanFromString = z
  .union([z.boolean(), z.string()])
  .transform((value) => value === true || value === 'true' || value === '1');

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PC_API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PC_API_HOST: z.string().default('0.0.0.0'),
  PC_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  PC_WEB_ORIGIN: z.string().default('http://localhost:5173'),
  PC_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().min(1),
  PC_DATABASE_SHADOW_URL: z.string().optional(),
  PC_DATABASE_SSL: booleanFromString.default(false),

  PC_REDIS_URL: z.string().optional().default(''),
  PC_REDIS_TLS: booleanFromString.default(false),
  PC_CACHE_FALLBACK: booleanFromString.default(true),

  PC_JWT_ACCESS_SECRET: z.string().min(32),
  PC_JWT_REFRESH_SECRET: z.string().min(32),
  PC_JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  PC_JWT_REFRESH_TTL: z.coerce.number().int().positive().default(1_209_600),
  PC_CSRF_SECRET: z.string().min(32),

  PC_COOKIE_DOMAIN: z.string().default('localhost'),
  PC_COOKIE_SECURE: booleanFromString.default(false),
  PC_COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('strict'),

  PC_STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  PC_STORAGE_LOCAL_ROOT: z.string().default('./var/storage'),
  PC_STORAGE_BUCKET: z.string().default('peoplecore'),
  PC_STORAGE_ENDPOINT: z.string().optional().default('http://localhost:9000'),
  PC_STORAGE_REGION: z.string().default('us-east-1'),
  PC_STORAGE_ACCESS_KEY: z.string().optional().default(''),
  PC_STORAGE_SECRET_KEY: z.string().optional().default(''),
  PC_STORAGE_USE_SSL: booleanFromString.default(false),

  PC_MAIL_DRIVER: z.enum(['log', 'smtp']).default('log'),
  PC_MAIL_FROM: z.string().default('no-reply@peoplecore.local'),
  PC_SMTP_URL: z.string().optional().default(''),

  PC_METRICS_ENABLED: booleanFromString.default(true),
  PC_METRICS_PORT: z.coerce.number().int().min(1).max(65535).default(9090),
  PC_SWAGGER_ENABLED: booleanFromString.default(true),

  PC_DEFAULT_TENANT_SLUG: z.string().default('demo'),
  PC_DEFAULT_TENANT_NAME: z.string().default('PeopleCore Demo'),
  PC_DEFAULT_ADMIN_EMAIL: z.string().email().default('admin@peoplecore.local'),
  PC_DEFAULT_ADMIN_PASSWORD: z.string().min(12).default('ChangeMe!2345'),
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(raw: Record<string, unknown>): Environment {
  const parsed = environmentSchema.safeParse(raw);
  if (!parsed.success) {
    const messages = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${messages.join('\n')}`);
  }
  return parsed.data;
}
