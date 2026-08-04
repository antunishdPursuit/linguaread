export const LANGUAGE_DISCLOSURE_STORAGE_KEY =
  'linguaread-language-disclosure-v1';

const LANGUAGE_DISCLOSURE_VERSION = 1;

type LocalStorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

type LanguageDisclosureRecord = {
  accepted: true;
  version: number;
};

function localStorageArea(): LocalStorageArea {
  return browser.storage.local;
}

export async function hasAcceptedLanguageDisclosure(
  storage: LocalStorageArea = localStorageArea(),
): Promise<boolean> {
  const stored = await storage.get(LANGUAGE_DISCLOSURE_STORAGE_KEY);
  const record = stored[LANGUAGE_DISCLOSURE_STORAGE_KEY] as
    | Partial<LanguageDisclosureRecord>
    | undefined;

  return (
    record?.accepted === true &&
    record.version === LANGUAGE_DISCLOSURE_VERSION
  );
}

export async function acceptLanguageDisclosure(
  storage: LocalStorageArea = localStorageArea(),
): Promise<void> {
  await storage.set({
    [LANGUAGE_DISCLOSURE_STORAGE_KEY]: {
      accepted: true,
      version: LANGUAGE_DISCLOSURE_VERSION,
    } satisfies LanguageDisclosureRecord,
  });
}
