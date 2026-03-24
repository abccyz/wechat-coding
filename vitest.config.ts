import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/**/index.ts', 'src/tools/**'],
      thresholds: {
        lines: 70,
        functions: 75,
        branches: 70,
        statements: 70,
      },
    },
    mockReset: true,
    restoreMocks: true,
  },
})
