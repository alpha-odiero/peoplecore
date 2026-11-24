import { Global, Module } from '@nestjs/common';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  providers: [OutboxService, OutboxDispatcherService],
  exports: [OutboxService, OutboxDispatcherService],
})
export class OutboxModule {}
