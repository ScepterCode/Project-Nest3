const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
});

const shared = {
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/__tests__/__mocks__/',
  ],
  transformIgnorePatterns: ['node_modules/(?!(isows|@supabase|@radix-ui)/)'],
};

const jsdomProject = {
  ...shared,
  displayName: 'jsdom',
  testEnvironment: 'jsdom',
  // jsdom resolves packages with the "browser" export condition, which picks
  // ESM-only builds (e.g. isows, used by @supabase/realtime-js) that next/jest
  // won't transform. Resolve like Node instead.
  testEnvironmentOptions: { customExportConditions: [''] },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: [
    '<rootDir>/__tests__/components/**/*.test.{js,jsx,ts,tsx}',
    '<rootDir>/__tests__/lib/**/*.test.{js,jsx,ts,tsx}',
    '<rootDir>/__tests__/contexts/**/*.test.{js,jsx,ts,tsx}',
    '<rootDir>/__tests__/integration/**/*.test.{js,jsx,ts,tsx}',
    '<rootDir>/__tests__/performance/**/*.test.{js,jsx,ts,tsx}',
  ],
};

const nodeProject = {
  ...shared,
  displayName: 'node',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.node.js'],
  testMatch: ['<rootDir>/__tests__/api/**/*.test.{js,jsx,ts,tsx}'],
};

// next/jest adds the SWC transform (TypeScript/JSX) to the config it builds,
// but Jest `projects` entries don't inherit it from the top level, which is
// why no TypeScript test could run before. Build each project through
// next/jest so every project gets the transform.
module.exports = async () => ({
  collectCoverageFrom: [
    'lib/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
  ],
  projects: [
    await createJestConfig(jsdomProject)(),
    await createJestConfig(nodeProject)(),
  ],
});
