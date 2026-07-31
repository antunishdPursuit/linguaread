import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'LinguaRead',
    description:
      'Read English PDFs with focused Mandarin and simpler-English support.',
    minimum_chrome_version: '127',
    permissions: ['tabs', 'storage', 'sidePanel'],
    optional_host_permissions: ['file:///*'],
    action: {
      default_title: 'LinguaRead — open a PDF to begin',
    },
  },
});
