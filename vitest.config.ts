import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['broker/**/*.test.ts', 'lib/**/*.test.ts'],
  },
});
