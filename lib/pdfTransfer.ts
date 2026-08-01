const DATABASE_NAME = 'linguaread-pdf-transfer';
const DATABASE_VERSION = 1;
const STORE_NAME = 'pdfs';
const TRANSFER_TTL_MS = 10 * 60 * 1000;

type StoredPdfTransfer = {
  blob: Blob;
  expiresAt: number;
  fileName: string;
  id: string;
};

function openTransferDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function removeExpiredTransfers(
  database: IDBDatabase,
  now: number,
): Promise<void> {
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  const request = store.openCursor();

  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;

    const transfer = cursor.value as StoredPdfTransfer;
    if (transfer.expiresAt <= now) cursor.delete();
    cursor.continue();
  };

  await waitForTransaction(transaction);
}

export async function storePdfTransfer(
  blob: Blob,
  fileName: string,
): Promise<string> {
  const database = await openTransferDatabase();
  const now = Date.now();
  await removeExpiredTransfers(database, now);

  const id = crypto.randomUUID();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).put({
    blob,
    expiresAt: now + TRANSFER_TTL_MS,
    fileName,
    id,
  } satisfies StoredPdfTransfer);
  await waitForTransaction(transaction);
  database.close();
  return id;
}

export async function consumePdfTransfer(
  id: string,
): Promise<{ blob: Blob; fileName: string } | null> {
  const database = await openTransferDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  const request = store.get(id);
  const transfer = await new Promise<StoredPdfTransfer | undefined>(
    (resolve, reject) => {
      request.onsuccess = () =>
        resolve(request.result as StoredPdfTransfer | undefined);
      request.onerror = () => reject(request.error);
    },
  );
  store.delete(id);
  await waitForTransaction(transaction);
  database.close();

  if (!transfer || transfer.expiresAt <= Date.now()) return null;
  return {
    blob: transfer.blob,
    fileName: transfer.fileName,
  };
}
