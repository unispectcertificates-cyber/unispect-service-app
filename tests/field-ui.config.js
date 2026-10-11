import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import config from '../vite.config.js';
export default mergeConfig(config, {
  resolve: { alias: [{ find: /^.*\/utils\/fieldService(?:\.js)?$/, replacement: fileURLToPath(new URL('./fieldService.mock.js', import.meta.url)) }] },
  build: { outDir: '../field-ui-test-build', emptyOutDir: true, rollupOptions: { input: 'tests/field-ui.html' } }
});
