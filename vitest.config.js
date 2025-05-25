import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './client/vitest.setup.js', // Path to your setup file
    include: ['client/**/*.test.{js,jsx}'], // Pattern to find test files
    css: false, // Optional: if you don't need CSS processing during tests
  },
});
