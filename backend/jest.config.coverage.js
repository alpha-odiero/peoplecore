const baseConfig = require('./jest.config.base');

module.exports = {
  ...baseConfig,
  testMatch: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
  setupFilesAfterEnv: ['<rootDir>/apps/api/test/setup-e2e.ts'],
  testTimeout: 30000,
  collectCoverageFrom: [
    'apps/api/src/**/*.ts',
    'packages/shared/src/**/*.ts',
    '!apps/api/src/main.ts',
    '!apps/api/src/worker.ts',
    '!**/*.spec.ts',
    '!**/*.e2e-spec.ts',
  ],
  coverageReporters: ['text-summary', 'lcov'],
  coverageThreshold: {
    global: {
      lines: 80,
    },
    './apps/api/src/platform/auth/**/*.ts': {
      lines: 90,
    },
    './apps/api/src/platform/tenancy/**/*.ts': {
      lines: 90,
    },
    './apps/api/src/platform/policy/**/*.ts': {
      lines: 90,
    },
    './apps/api/src/platform/outbox/**/*.ts': {
      lines: 90,
    },
    './apps/api/src/modules/contracts/**/*.ts': {
      lines: 90,
    },
    './apps/api/src/modules/employees/**/*.ts': {
      lines: 90,
    },
  },
};
