import { DataSource } from 'typeorm';

// Translation seeding has been removed.
// Use the POST /api/translations/bulk endpoint to seed translations via the API.
export async function seedTranslations(_dataSource: DataSource): Promise<void> {
  // no-op
}
