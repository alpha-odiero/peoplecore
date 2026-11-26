import { parseDatabaseTarget } from './database-diagnostics';

describe('parseDatabaseTarget', () => {
  it('supports the Supabase Session pooler format', () => {
    const target = parseDatabaseTarget(
      'postgresql://postgres.abcdefghijklmnop:p%40ssword@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
    );

    expect(target).toMatchObject({
      host: 'aws-0-us-east-1.pooler.supabase.com',
      port: 5432,
      database: 'postgres',
      isSupabasePooler: true,
    });
  });

  it('identifies a direct Supabase endpoint as non-pooler', () => {
    const target = parseDatabaseTarget(
      'postgresql://postgres:secret@db.abcdefghijklmnop.supabase.co:5432/postgres',
    );

    expect(target?.isSupabasePooler).toBe(false);
  });

  it('defaults to port 5432 when no port is present', () => {
    const target = parseDatabaseTarget(
      'postgresql://postgres.abcdefghijklmnop:p%40ssword@aws-0-us-east-1.pooler.supabase.com/postgres',
    );

    expect(target?.port).toBe(5432);
  });

  it('does not include credentials in the parsed diagnostic fields', () => {
    const target = parseDatabaseTarget(
      'postgresql://postgres.abcdefghijklmnop:p%40ssword@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
    );

    expect(JSON.stringify(target)).not.toContain('p%40ssword');
    expect(JSON.stringify(target)).not.toContain('abcdefghijklmnop');
  });

  it('rejects missing, malformed and non-PostgreSQL values', () => {
    expect(parseDatabaseTarget(undefined)).toBeNull();
    expect(parseDatabaseTarget('not-a-url')).toBeNull();
    expect(parseDatabaseTarget('https://example.com:5432/postgres')).toBeNull();
  });
});
