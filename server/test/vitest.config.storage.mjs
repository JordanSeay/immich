import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: './',
    globals: true,
    include: ['test/storage/**/*.spec.ts'],
    testTimeout: 30_000, // S3 ops may be slow against LocalStack
    server: {
      deps: {
        fallbackCJS: true,
      },
    },
    env: {
      TZ: 'UTC',
      IMMICH_STORAGE_BACKEND: 's3',
      IMMICH_S3_BUCKET: 'immich-test-media',
      IMMICH_S3_REGION: 'us-east-1',
      IMMICH_S3_ENDPOINT: 'http://localhost:4567',
      IMMICH_S3_ACCESS_KEY: 'test',
      IMMICH_S3_SECRET_KEY: 'test',
      IMMICH_S3_FORCE_PATH_STYLE: 'true',
    },
  },
  plugins: [swc.vite(), tsconfigPaths()],
});
