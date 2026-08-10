import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      'cloudflare:workers': fileURLToPath(
        new URL('./broker/test/cloudflareWorkers.ts', import.meta.url),
      ),
    },
  },
  test: {
    exclude: ['broker/**/*.runtime.test.ts'],
    include: ['broker/**/*.test.ts', 'lib/**/*.test.ts'],
  },
});
