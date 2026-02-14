import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: './',
    globals: true,
    include: ['test/storage/**/*.spec.ts'],
    // S3 operations against LocalStack can be slow due to network roundtrips.
    // Each test may perform multiple S3 API calls (write + read + cleanup).
    // 30s is generous but prevents flaky failures in CI.
    testTimeout: 30_000,
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
