const databaseUrlAtStartup = process.env.DATABASE_URL;

export function getDatabaseUrlAtStartup(): string | undefined {
  return databaseUrlAtStartup;
}
