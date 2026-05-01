import { DataSource } from 'typeorm';
import { Language } from '../../language/entities/language.entity';
import { Translation } from '../../translations/entities/translation.entity';
import { getDefaultKeysMap } from '../../translations/default-keys';

/**
 * Backfill default translation keys for all existing languages.
 * This ensures that languages created before the auto-insert feature
 * also get the default keys with empty values.
 */
export async function seedTranslationKeys(dataSource: DataSource): Promise<void> {
  const languageRepo = dataSource.getRepository(Language);
  const translationRepo = dataSource.getRepository(Translation);

  // Get all languages
  const languages = await languageRepo.find();

  if (!languages.length) {
    console.log('ℹ No languages found to seed translation keys');
    return;
  }

  const defaultKeys = getDefaultKeysMap();
  let totalInserted = 0;

  for (const language of languages) {
    // Check if this language already has translations
    const existingCount = await translationRepo.countBy({
      languageCode: language.code,
    });

    if (existingCount > 0) {
      console.log(`✓ Language "${language.code}" already has ${existingCount} translations, skipping`);
      continue;
    }

    // Insert default keys for this language
    const entries = Object.entries(defaultKeys).map(([keyword, value]) =>
      translationRepo.create({
        keyword,
        languageCode: language.code,
        value,
      }),
    );

    await translationRepo.save(entries);
    totalInserted += entries.length;
    console.log(`✓ Inserted ${entries.length} default keys for language: ${language.code}`);
  }

  console.log(`✓ Translation keys seeding complete. Total inserted: ${totalInserted}`);
}
