import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'LinguaRead BETA',
    description:
      'THIS EXTENSION IS FOR BETA TESTING. Read English PDFs with focused Mandarin and simpler-English support.',
    minimum_chrome_version: '127',
    permissions: ['activeTab', 'tabs', 'storage', 'sidePanel'],
    host_permissions: [
      'https://linguaread-language-broker.enhancereactapptest.workers.dev/*',
    ],
    icons: {
      16: 'icons/linguaread-16.png',
      32: 'icons/linguaread-32.png',
      48: 'icons/linguaread-48.png',
      128: 'icons/linguaread-128.png',
    },
    action: {
      default_icon: {
        16: 'icons/linguaread-16.png',
        32: 'icons/linguaread-32.png',
      },
      default_title: 'LinguaRead — open a PDF to begin',
    },
  },
});
