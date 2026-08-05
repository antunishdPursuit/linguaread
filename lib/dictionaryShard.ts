export class DictionaryShardUnavailableError extends Error {
  constructor(
    public readonly shardName: string,
    options?: ErrorOptions,
  ) {
    super(`Dictionary shard "${shardName}" is unavailable.`, options);
    this.name = 'DictionaryShardUnavailableError';
  }
}

type LoadDictionaryShardOptions<T> = {
  cache: Map<string, Promise<T>>;
  fetch(input: string): Promise<Response>;
  name: string;
  parse(value: unknown): T;
  url: string;
};

class DictionaryAssetResponseError extends Error {
  constructor(
    status: number,
    public readonly transient: boolean,
  ) {
    super(`Dictionary asset returned ${status}.`);
    this.name = 'DictionaryAssetResponseError';
  }
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function fetchShard<T>(
  options: LoadDictionaryShardOptions<T>,
): Promise<T> {
  let lastError: unknown;

  // One retry covers a short extension-asset or browser fetch interruption
  // without multiplying normal dictionary requests.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await options.fetch(options.url);
      if (!response.ok) {
        const error = new DictionaryAssetResponseError(
          response.status,
          isTransientStatus(response.status),
        );
        if (!error.transient) throw error;
        lastError = error;
        continue;
      }
      return options.parse(await response.json());
    } catch (error) {
      lastError = error;
      if (
        error instanceof DictionaryAssetResponseError &&
        !error.transient
      ) {
        break;
      }
    }
  }

  throw new DictionaryShardUnavailableError(options.name, {
    cause: lastError,
  });
}

export function loadCachedDictionaryShard<T>(
  options: LoadDictionaryShardOptions<T>,
): Promise<T> {
  const existing = options.cache.get(options.name);
  if (existing) return existing;

  const request = fetchShard(options).catch((error) => {
    // A failed request must not poison the cache. A later user retry should
    // make a fresh attempt.
    if (options.cache.get(options.name) === request) {
      options.cache.delete(options.name);
    }
    throw error;
  });
  options.cache.set(options.name, request);
  return request;
}
