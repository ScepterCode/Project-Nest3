const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/', '<rootDir>/__tests__/__mocks__/'],
  transformIgnorePatterns: [
    'node_modules/(?!(isows|@supabase|@radix-ui)/)'
  ],
  collectCoverageFrom: [
    'lib/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
  ],
  projects: [
    {
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
      testMatch: ['<rootDir>/__tests__/components/**/*.test.{js,jsx,ts,tsx}', '<rootDir>/__tests__/lib/**/*.test.{js,jsx,ts,tsx}', '<rootDir>/__tests__/contexts/**/*.test.{js,jsx,ts,tsx}', '<rootDir>/__tests__/integration/**/*.test.{js,jsx,ts,tsx}', '<rootDir>/__tests__/performance/**/*.test.{js,jsx,ts,tsx}'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
      },
      transformIgnorePatterns: [
        'node_modules/(?!(isows|@supabase|@radix-ui)/)'
      ],
    },
    {
      displayName: 'node',
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/jest.setup.node.js'],
      testMatch: ['<rootDir>/__tests__/api/**/*.test.{js,jsx,ts,tsx}'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
      },
      transformIgnorePatterns: [
        'node_modules/(?!(isows|@supabase|@radix-ui)/)'
      ],
    },
  ],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)