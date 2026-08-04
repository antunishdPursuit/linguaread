import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'LinguaRead',
    description:
      'Read English PDFs with focused Mandarin and simpler-English support.',
    minimum_chrome_version: '127',
    permissions: ['activeTab', 'tabs', 'storage', 'sidePanel'],
    host_permissions: [
      'https://linguaread-language-broker.enhancereactapptest.workers.dev/*',
    ],
    action: {
      default_title: 'LinguaRead — open a PDF to begin',
    },
  },
});
