import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',

  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],

  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },

  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/app/**/page.tsx',
    '!src/app/**/layout.tsx',
    '!src/lib/utils.ts',
  ],

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  testMatch: [
    '<rootDir>/tests/unit/**/*.test.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/*.test.{js,jsx,ts,tsx}',
  ],

  setupFilesAfterEnv: ['<rootDir>/jest.setup.tsx'],

  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/out/',
    '<rootDir>/coverage/',
    '<rootDir>/cypress/',
  ],
  transformIgnorePatterns: ['node_modules/(?!(lucide-react)/)'],

  clearMocks: true,
};

export default createJestConfig(config);
