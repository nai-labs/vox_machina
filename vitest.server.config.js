import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // Crucial for server-side tests
    include: ['**/*.test.js'], // Pattern to find server test files (e.g., server.test.js)
    // Exclude client tests if they are in a pattern that might overlap, though `include` should be specific enough.
    // exclude: ['client/**/*.test.jsx'], 
    // setupFiles: [], // No JSDOM setup needed for server tests
    // No react plugin needed for server tests unless testing React SSR components outside of HTTP layer.
    // For Express API tests, it's not needed.
    // css: false, // Not relevant for Node environment
    
    // Vitest might pick up the global `vite.config.js` or `vitest.config.js` by default.
    // To ensure this config is isolated, sometimes explicit overrides or clearing plugins might be needed,
    // but usually, a specific config file like this works well.
    // If `server.js` imports client-side code that causes issues (e.g. React components),
    // those imports might need to be mocked or handled. However, `server.js` seems mostly self-contained.
  },
});
