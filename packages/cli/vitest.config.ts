import { defineConfig } from 'vitest/config';

// Set up Vitest configuration
export default defineConfig({
  test: {
    disableConsoleIntercept: true,
    globals: true,
    include: ['./test/bin.test.ts']
  }
});

