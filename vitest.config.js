import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Strip shebang lines (#!) from source files before they are parsed.
    // cli.js and mcp-server.js both start with #!/usr/bin/env node which
    // causes a SyntaxError when Vitest's ESM transformer tries to parse them.
    transformMode: { web: [] },
  },
  esbuild: {
    // esbuild handles shebang stripping natively - no extra plugin needed
    banner: '',
  },
  plugins: [
    {
      name: 'strip-shebang',
      transform(code, id) {
        if (code.startsWith('#!')) {
          return { code: code.replace(/^#![^\n]*\n/, ''), map: null };
        }
      },
    },
  ],
});

