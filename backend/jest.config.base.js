/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/apps/api', '<rootDir>/packages/shared', '<rootDir>/tests'],
  testMatch: ['**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleNameMapper: {
    '^@peoplecore/shared$': '<rootDir>/packages/shared/src/index.ts',
    '^@/(.*)$': '<rootDir>/apps/api/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.base.json',
        diagnostics: { warnOnly: false },
      },
    ],
  },
  collectCoverageFrom: [
    'apps/api/src/**/*.ts',
    'packages/shared/src/**/*.ts',
    '!apps/api/src/main.ts',
    '!apps/api/src/worker.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  clearMocks: true,
  verbose: false,
};
