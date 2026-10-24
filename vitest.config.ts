import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['apps/**/src/**/*.test.ts', 'packages/**/src/**/*.test.ts', 'packages/db/catalog/**/*.test.ts'],
    environment: 'node',
  },
})
