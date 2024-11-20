/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
export default {
  coveragePathIgnorePatterns: ['<rootDir>/test/', '<rootDir>/node_modules/'],
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 60000,
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
};
