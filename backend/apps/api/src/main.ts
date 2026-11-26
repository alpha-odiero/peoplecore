import './runtime-env';
import { ConfigService } from '@nestjs/config';
import { createApp } from './app.factory';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get(ConfigService);
  const port = config.get<number>('PC_API_PORT') ?? 3000;
  const host = config.get<string>('PC_API_HOST') ?? '0.0.0.0';
  await app.listen(port, host);
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal startup error: ${redactConnectionStrings(message)}\n`);
  process.exit(1);
});

function redactConnectionStrings(message: string): string {
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database URL redacted]');
}
