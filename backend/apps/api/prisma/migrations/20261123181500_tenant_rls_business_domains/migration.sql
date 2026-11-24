DO $$
DECLARE t text;
DECLARE tenant_expr text := 'nullif(current_setting(''app.tenant_id'', true), '''')::uuid';
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tenantId'
    GROUP BY table_name
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("tenantId" = %s) WITH CHECK ("tenantId" = %s)',
      t, tenant_expr, tenant_expr
    );
  END LOOP;
END $$;
