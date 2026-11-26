import { lookup } from 'node:dns/promises';
import { createConnection } from 'node:net';
import { getDatabaseUrlAtStartup } from '../runtime-env';

const TCP_TIMEOUT_MS = 3000;

export interface DatabaseTarget {
  host: string;
  port: number;
  database: string;
  isSupabasePooler: boolean;
}

export interface NetworkDiagnostics {
  dns: 'ok' | 'failed';
  addressCount?: number;
  dnsError?: string;
  tcp: 'ok' | 'failed' | 'skipped';
  tcpError?: string;
}

export interface DatabaseDiagnosticsResult {
  reason: 'ok' | 'missing' | 'invalid' | 'env-source-mismatch';
  target: DatabaseTarget | null;
  network: NetworkDiagnostics | null;
}

export function parseDatabaseTarget(value: string | undefined): DatabaseTarget | null {
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') return null;

  const host = url.hostname.replace(/^\[/, '').replace(/\]$/, '');
  const port = url.port ? Number(url.port) : 5432;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;

  const database = safeDecode(url.pathname.slice(1).split('/')[0] ?? '') || '(none)';
  return {
    host,
    port,
    database,
    isSupabasePooler: /pooler\.supabase\.com$/i.test(host),
  };
}

export async function runDatabaseDiagnostics(phase: string): Promise<DatabaseDiagnosticsResult> {
  const configured = process.env.DATABASE_URL;
  if (!configured) {
    emit({ phase, configured: false, reason: 'missing' });
    return { reason: 'missing', target: null, network: null };
  }

  if (process.env.NODE_ENV === 'production' && configured !== getDatabaseUrlAtStartup()) {
    emit({ phase, configured: true, reason: 'env-source-mismatch' });
    return { reason: 'env-source-mismatch', target: null, network: null };
  }

  const target = parseDatabaseTarget(configured);
  if (!target) {
    emit({ phase, configured: true, reason: 'invalid' });
    return { reason: 'invalid', target: null, network: null };
  }

  const network = await probeDatabaseNetwork(target);
  emit({
    phase,
    configured: true,
    reason: 'ok',
    host: target.host,
    port: target.port,
    database: target.database,
    isSupabasePooler: target.isSupabasePooler,
    ...network,
  });
  return { reason: 'ok', target, network };
}

export function logDiagnosticHint(phase: string, hint: string): void {
  emit({ phase, hint });
}

async function probeDatabaseNetwork(target: DatabaseTarget): Promise<NetworkDiagnostics> {
  let addressCount: number;
  try {
    const addresses = await lookup(target.host, { all: true });
    addressCount = addresses.length;
  } catch (error) {
    return { dns: 'failed', dnsError: errorCodeOf(error), tcp: 'skipped' };
  }

  try {
    await connectTcp(target.host, target.port);
    return { dns: 'ok', addressCount, tcp: 'ok' };
  } catch (error) {
    return { dns: 'ok', addressCount, tcp: 'failed', tcpError: errorCodeOf(error) };
  }
}

function connectTcp(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };

    socket.setTimeout(TCP_TIMEOUT_MS);
    socket.once('connect', () => finish());
    socket.once('timeout', () => finish(withCode('ETIMEDOUT')));
    socket.once('error', (error: Error) => finish(error));
  });
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function errorCodeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return error instanceof Error ? error.name : 'UNKNOWN';
}

function withCode(code: string): Error {
  return Object.assign(new Error(code), { code });
}

function emit(payload: Record<string, unknown>): void {
  process.stdout.write(`[database-diagnostics] ${JSON.stringify(payload)}\n`);
}
