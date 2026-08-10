import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    build: {
      modulePreload: false,
    },
  }),
  manifest: ({ mode }) => {
    const configuredUrl =
      import.meta.env.VITE_LINGUAREAD_LANGUAGE_BROKER_URL?.trim() ?? '';

    if (!configuredUrl && mode === 'production') {
      throw new Error(
        'VITE_LINGUAREAD_LANGUAGE_BROKER_URL is required for a functional build. Copy .env.example to .env and set your own Worker endpoint.',
      );
    }

    let brokerOrigin: string | undefined;
    if (configuredUrl) {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(configuredUrl);
      } catch {
        throw new Error(
          'VITE_LINGUAREAD_LANGUAGE_BROKER_URL must be an absolute HTTPS URL or a localhost HTTP URL.',
        );
      }

      const isLocalHttp =
        parsedUrl.protocol === 'http:' &&
        ['127.0.0.1', '::1', 'localhost'].includes(parsedUrl.hostname);
      if (parsedUrl.protocol !== 'https:' && !isLocalHttp) {
        throw new Error(
          'VITE_LINGUAREAD_LANGUAGE_BROKER_URL must use HTTPS unless it targets localhost.',
        );
      }
      if (
        parsedUrl.username ||
        parsedUrl.password ||
        parsedUrl.search ||
        parsedUrl.hash
      ) {
        throw new Error(
          'VITE_LINGUAREAD_LANGUAGE_BROKER_URL must not include credentials, a query, or a fragment.',
        );
      }

      brokerOrigin = parsedUrl.origin;
    }

    return {
      name: 'LinguaRead BETA',
      description:
        'THIS EXTENSION IS FOR BETA TESTING. Read English PDFs with contextual Mandarin word help and a saved-word Dictionary.',
      minimum_chrome_version: '127',
      permissions: ['activeTab', 'tabs', 'storage', 'sidePanel'],
      host_permissions: brokerOrigin ? [`${brokerOrigin}/*`] : [],
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
    };
  },
});
