module.exports = {
  rootDir: '../..',
  testMatch: ['<rootDir>/test/agent-mcp-p0/*.spec.ts'],
  testEnvironment: 'node',
  testTimeout: 20000,
  maxWorkers: 1,
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2022',
          module: 'commonjs',
          esModuleInterop: true,
          skipLibCheck: true,
          strict: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          baseUrl: '.',
          paths: { '@docmost/db/*': ['src/database/*'], 'src/*': ['src/*'] },
        },
        diagnostics: true,
      },
    ],
  },
  moduleNameMapper: {
    '^@docmost/db/(.*)$': '<rootDir>/src/database/$1',
    '^src/(.*)$': '<rootDir>/src/$1',
    '^crossws/adapters/node$': '<rootDir>/test/crossws-node-adapter-stub.js',
  },
};
