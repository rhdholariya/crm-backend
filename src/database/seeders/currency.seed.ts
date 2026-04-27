import { DataSource } from 'typeorm';
import { Currency } from '../../currency/entities/currency.entity';

const DEFAULT_CURRENCIES = [
  { name: 'US Dollar', code: 'USD', symbol: '$' },
  { name: 'Euro', code: 'EUR', symbol: '€' },
  { name: 'British Pound', code: 'GBP', symbol: '£' },
  { name: 'Indian Rupee', code: 'INR', symbol: '₹' },
  { name: 'UAE Dirham', code: 'AED', symbol: 'د.إ' },
  { name: 'Saudi Riyal', code: 'SAR', symbol: '﷼' },
  { name: 'Australian Dollar', code: 'AUD', symbol: 'A$' },
  { name: 'Canadian Dollar', code: 'CAD', symbol: 'C$' },
];

export async function seedCurrencies(dataSource: DataSource) {
  const repo = dataSource.getRepository(Currency);

  for (const c of DEFAULT_CURRENCIES) {
    const exists = await repo.findOneBy({ code: c.code });
    if (!exists) {
      await repo.save(repo.create({ ...c, isActive: true }));
    }
  }

  console.log('✓ Default currencies seeded');
}
