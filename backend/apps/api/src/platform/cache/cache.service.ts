import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PinoLogger } from '../../common/pino-logger.service';

interface MemoryEntry {
  value: string;
  expiresAt: number | null;
}

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private readonly memory = new Map<string, MemoryEntry>();
  private readonly fallbackEnabled: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.fallbackEnabled = String(this.config.get('PC_CACHE_FALLBACK')) === 'true';
  }

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('PC_REDIS_URL');
    if (!url) {
      this.logger.warn('Redis URL is empty; using in-memory cache fallback');
      return;
    }
    try {
      this.client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      await this.client.connect();
      this.logger.info('Redis connected');
    } catch (error) {
      this.client = null;
      if (!this.fallbackEnabled) throw error;
      this.logger.warn({ err: error }, 'Redis unavailable; using in-memory cache fallback');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.quit();
  }

  async get(key: string): Promise<string | null> {
    if (this.client) return this.client.get(key);
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.client) {
      if (ttlSeconds) await this.client.set(key, value, 'EX', ttlSeconds);
      else await this.client.set(key, value);
      return;
    }
    this.memory.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    if (this.client) {
      await this.client.del(key);
      return;
    }
    this.memory.delete(key);
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    if (this.client) {
      const value = await this.client.incr(key);
      if (ttlSeconds && value === 1) await this.client.expire(key, ttlSeconds);
      return value;
    }
    const entry = this.memory.get(key);
    const current =
      entry && (entry.expiresAt === null || entry.expiresAt > Date.now()) ? Number(entry.value) : 0;
    const value = current + 1;
    this.memory.set(key, {
      value: String(value),
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
    return value;
  }

  async healthCheck(): Promise<{ ok: boolean; mode: 'redis' | 'memory' }> {
    if (this.client) {
      try {
        const result = await this.client.ping();
        return { ok: result === 'PONG', mode: 'redis' };
      } catch {
        return { ok: false, mode: 'redis' };
      }
    }
    return { ok: this.fallbackEnabled, mode: 'memory' };
  }
}
