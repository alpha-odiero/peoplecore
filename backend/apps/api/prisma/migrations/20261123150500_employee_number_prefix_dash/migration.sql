ALTER TABLE "Tenant" ALTER COLUMN "employeeNumberPrefix" SET DEFAULT 'EMP-';

UPDATE "Tenant"
SET "employeeNumberPrefix" = 'EMP-'
WHERE "employeeNumberPrefix" = 'EMP';

UPDATE "Employee"
SET "employeeNumber" = 'EMP-' || substring("employeeNumber" from 4)
WHERE "employeeNumber" LIKE 'EMP%' AND "employeeNumber" NOT LIKE 'EMP-%';
