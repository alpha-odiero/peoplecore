import { Module } from '@nestjs/common';
import { CacheModule } from '../platform/cache/cache.module';
import { StorageModule } from '../platform/storage/storage.module';
import { HealthController } from './health.controller';

@Module({
  imports: [CacheModule, StorageModule],
  controllers: [HealthController],
})
export class HealthModule {}
