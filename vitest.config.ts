import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './artifacts/coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'debugging/**',
        'src/**/*.spec.ts',
        'src/**/*.test.ts',
        'scripts/tech-debt-report.mjs',
        'src/clientProfiles/types.ts',
        'src/httpServerIngress.ts',
        'src/httpServerShared.ts',
        'src/httpServerTransportRoutes.ts',
        'src/reliabilityHttpCli.ts',
        'src/reliabilityLoadCli.ts',
        'src/stdioServer.ts',
        'src/typeUtils.contract.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
