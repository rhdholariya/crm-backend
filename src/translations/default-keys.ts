import defaultKeysJson from './en_flat_empty.json';

/**
 * Default translation keys with empty values.
 * When a new language is created, these keys are automatically inserted
 * with empty values, and the admin fills in the translations.
 */
export const DEFAULT_TRANSLATION_KEYS: Record<string, string> = defaultKeysJson;

/**
 * Get all default keys as an array
 */
export function getDefaultKeys(): string[] {
  return Object.keys(DEFAULT_TRANSLATION_KEYS);
}

/**
 * Get default keys as a map with empty values for bulk insert
 */
export function getDefaultKeysMap(): Record<string, string> {
  return { ...DEFAULT_TRANSLATION_KEYS };
}
