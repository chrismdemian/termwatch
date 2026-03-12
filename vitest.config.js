import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'main',
          include: ['test/main/**/*.test.js'],
          environment: 'node',
          setupFiles: ['test/setup-electron-mock.js'],
        },
      },
      {
        test: {
          name: 'renderer',
          include: ['test/renderer/**/*.test.js'],
          environment: 'happy-dom',
        },
      },
    ],
  },
});
