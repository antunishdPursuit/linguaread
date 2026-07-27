import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'LinguaRead',
    description:
      'Read English PDFs with focused Mandarin and simpler-English support.',
    permissions: ['storage', 'sidePanel'],
    action: {
      default_title: 'Open LinguaRead',
    },
  },
});
