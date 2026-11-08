import type { StateStorage } from "zustand/middleware";

/**
 * Wraps a Storage so a persisted store can be renamed without losing data.
 * When the new key has nothing saved yet, the value under `legacyKey` is
 * moved to the new key (and the legacy entry removed) on first read.
 */
export function withLegacyKey(storage: Storage, legacyKey: string): StateStorage {
  return {
    getItem: (name) => {
      const current = storage.getItem(name);
      if (current !== null) return current;
      const legacy = storage.getItem(legacyKey);
      if (legacy !== null) {
        storage.setItem(name, legacy);
        storage.removeItem(legacyKey);
      }
      return legacy;
    },
    setItem: (name, value) => storage.setItem(name, value),
    removeItem: (name) => storage.removeItem(name),
  };
}
