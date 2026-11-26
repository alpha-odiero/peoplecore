import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { validateEnvironment } from './config/environment';
import { CommonModule } from './common/common.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { MetricsController } from './common/metrics.controller';
import { globalValidationPipe } from './common/pipes/global-validation.pipe';
import { RequestContextMiddleware } from './common/request-context.middleware';
import { HealthModule } from './health/health.module';
import { AdminModule } from './modules/admin/admin.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { ImportsModule } from './modules/imports/imports.module';
import { LeaveModule } from './modules/leave/leave.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { RecruitingModule } from './modules/recruiting/recruiting.module';
import { AuthModule } from './platform/auth/auth.module';
import { CacheModule } from './platform/cache/cache.module';
import { PolicyModule } from './platform/policy/policy.module';
import { StorageModule } from './platform/storage/storage.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      validate: validateEnvironment,
    }),
    CommonModule,
    PrismaModule,
    CacheModule,
    StorageModule,
    PolicyModule,
    AuthModule,
    ContractsModule,
    DocumentsModule,
    EmployeesModule,
    ImportsModule,
    NotificationsModule,
    ApprovalsModule,
    LeaveModule,
    AttendanceModule,
    PayrollModule,
    RecruitingModule,
    PerformanceModule,
    OrganizationModule,
    AdminModule,
    HealthModule,
  ],
  controllers: [MetricsController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_PIPE, useValue: globalValidationPipe },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
