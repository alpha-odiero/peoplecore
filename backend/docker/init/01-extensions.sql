CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'peoplecore_app') THEN
    CREATE ROLE peoplecore_app NOLOGIN;
  END IF;
END
$$;

GRANT peoplecore_app TO peoplecore;
