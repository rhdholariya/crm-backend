import { DataSource } from 'typeorm';
import { Language } from '../../language/entities/language.entity';

const DEFAULT_LANGUAGES = [
  { name: 'English',    code: 'en', flag: '🇬🇧' },
  { name: 'Hindi',      code: 'hi', flag: '🇮🇳' },
  { name: 'Arabic',     code: 'ar', flag: '🇸🇦' },
  { name: 'French',     code: 'fr', flag: '🇫🇷' },
  { name: 'Spanish',    code: 'es', flag: '🇪🇸' },
  { name: 'Portuguese', code: 'pt', flag: '🇵🇹' },
  { name: 'German',     code: 'de', flag: '🇩🇪' },
  { name: 'Urdu',       code: 'ur', flag: '🇵🇰' },
  { name: 'Bengali',    code: 'bn', flag: '🇧🇩' },
  { name: 'Indonesian', code: 'id', flag: '🇮🇩' },
];

export async function seedLanguages(dataSource: DataSource) {
  const repo = dataSource.getRepository(Language);

  for (const l of DEFAULT_LANGUAGES) {
    const exists = await repo.findOneBy({ code: l.code });
    if (!exists) {
      await repo.save(repo.create({ ...l, isActive: true }));
    } else if (!exists.flag) {
      // backfill flag for rows seeded before the flag column was added
      await repo.update(exists.id, { flag: l.flag });
    }
  }

  console.log('✓ Default languages seeded');
}
