import { resolve } from 'node:path';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { createDb } from './index';
import {
  users,
  authors,
  authorContracts,
  titles,
  channelPartners,
} from './schema/index';

// Load .env from monorepo root
const dir = typeof __dirname !== 'undefined' ? __dirname : resolve(import.meta.dirname);
config({ path: resolve(dir, '../../../.env') });

const db = createDb(process.env.DATABASE_URL!);

async function seed() {
  console.log('Seeding database...');

  // 1. Admin user
  const [adminUser] = await db.insert(users).values({
    email: 'admin@xarrabooks.com',
    name: 'Admin User',
    passwordHash: '$2b$10$placeholder_hash_replace_with_real', // placeholder
    role: 'ADMIN',
    isActive: true,
  }).onConflictDoNothing({ target: users.email }).returning();

  const admin = adminUser ?? (await db.select().from(users).where(eq(users.email, 'admin@xarrabooks.com')))[0];
  console.log(`  Admin user: ${admin.email}`);

  // 2. Authors
  const authorData = [
    {
      legalName: 'Thando Mokoena',
      penName: 'T. Mokoena',
      type: 'HYBRID' as const,
      email: 'thando@example.com',
      phone: '+27 82 555 0001',
      addressLine1: '45 Jacaranda Street',
      city: 'Midrand',
      province: 'Gauteng',
      postalCode: '1685',
      country: 'South Africa',
      taxNumber: '1234567890',
      isActive: true,
    },
    {
      legalName: 'Sarah van der Merwe',
      penName: null,
      type: 'TRADITIONAL' as const,
      email: 'sarah.vdm@example.com',
      phone: '+27 83 555 0002',
      addressLine1: '12 Oak Avenue',
      city: 'Stellenbosch',
      province: 'Western Cape',
      postalCode: '7600',
      country: 'South Africa',
      taxNumber: '0987654321',
      isActive: true,
    },
    {
      legalName: 'James Ndlovu',
      penName: 'J.K. Ndlovu',
      type: 'HYBRID' as const,
      email: 'james.ndlovu@example.com',
      phone: '+27 71 555 0003',
      addressLine1: '78 Umhlanga Drive',
      city: 'Durban',
      province: 'KwaZulu-Natal',
      postalCode: '4320',
      country: 'South Africa',
      taxNumber: '5678901234',
      isActive: true,
    },
  ];

  const insertedAuthors = await db.insert(authors).values(authorData).onConflictDoNothing().returning();
  const allAuthors = insertedAuthors.length > 0 ? insertedAuthors : await db.select().from(authors);
  console.log(`  Authors: ${allAuthors.length} records`);

  // 3. Titles
  const titleData = [
    {
      title: 'Ubuntu: Stories of Togetherness',
      subtitle: 'A Collection of South African Tales',
      isbn13: '9781234567890',
      rrpZar: '299.00',
      costPriceZar: '85.00',
      formats: ['PRINT', 'EBOOK'],
      status: 'ACTIVE' as const,
      description: 'A heartwarming collection of stories celebrating the spirit of Ubuntu.',
      primaryAuthorId: allAuthors[0]?.id,
      pageCount: 320,
      weightGrams: 450,
      publishDate: new Date('2024-06-15'),
    },
    {
      title: 'The Cape Winelands Mystery',
      subtitle: null,
      isbn13: '9781234567906',
      rrpZar: '249.00',
      costPriceZar: '72.00',
      formats: ['PRINT'],
      status: 'ACTIVE' as const,
      description: 'A gripping detective novel set in the picturesque Cape Winelands.',
      primaryAuthorId: allAuthors[1]?.id,
      pageCount: 280,
      weightGrams: 380,
      publishDate: new Date('2024-09-01'),
    },
    {
      title: 'Zulu Rising',
      subtitle: 'A Historical Epic',
      isbn13: '9781234567913',
      rrpZar: '350.00',
      costPriceZar: '110.00',
      formats: ['PRINT', 'EBOOK', 'PDF'],
      status: 'ACTIVE' as const,
      description: 'An epic historical novel set during the Anglo-Zulu War.',
      primaryAuthorId: allAuthors[2]?.id,
      pageCount: 480,
      weightGrams: 620,
      publishDate: new Date('2025-01-20'),
    },
    {
      title: 'Braai Masters',
      subtitle: 'The Ultimate South African BBQ Guide',
      isbn13: '9781234567920',
      rrpZar: '399.00',
      costPriceZar: '150.00',
      formats: ['PRINT'],
      status: 'PRODUCTION' as const,
      description: 'The definitive guide to South African braai culture and recipes.',
      primaryAuthorId: allAuthors[0]?.id,
      pageCount: 240,
      weightGrams: 680,
    },
  ];

  const insertedTitles = await db.insert(titles).values(titleData).onConflictDoNothing().returning();
  const allTitles = insertedTitles.length > 0 ? insertedTitles : await db.select().from(titles);
  console.log(`  Titles: ${allTitles.length} records`);

  // 4. Author Contracts
  const contractData = [
    {
      authorId: allAuthors[0]?.id!,
      titleId: allTitles[0]?.id!,
      royaltyRatePrint: '0.2500', // 25% hybrid
      royaltyRateEbook: '0.3500', // 35% ebook
      triggerType: 'DATE' as const,
      advanceAmount: '0',
      advanceRecovered: '0',
      isSigned: true,
      startDate: new Date('2024-06-01'),
    },
    {
      authorId: allAuthors[1]?.id!,
      titleId: allTitles[1]?.id!,
      royaltyRatePrint: '0.1000', // 10% traditional
      royaltyRateEbook: '0.1500', // 15% ebook
      triggerType: 'DATE' as const,
      advanceAmount: '15000.00',
      advanceRecovered: '3500.00',
      isSigned: true,
      startDate: new Date('2024-08-01'),
    },
    {
      authorId: allAuthors[2]?.id!,
      titleId: allTitles[2]?.id!,
      royaltyRatePrint: '0.2500',
      royaltyRateEbook: '0.3000',
      triggerType: 'UNITS' as const,
      triggerValue: '500',
      advanceAmount: '0',
      advanceRecovered: '0',
      isSigned: true,
      startDate: new Date('2025-01-01'),
    },
  ];

  await db.insert(authorContracts).values(contractData).onConflictDoNothing();
  console.log(`  Author contracts: ${contractData.length} records`);

  // 5. Channel Partners
  const partnerData = [
    {
      name: 'Bargain Books',
      discountPct: '50.00',
      sorDays: 90,
      paymentTermsDays: 60,
      paymentDay: 25,
      contactName: 'Pieter du Plessis',
      contactEmail: 'pieter@bargainbooks.co.za',
      contactPhone: '+27 11 555 1000',
      remittanceEmail: 'accounts@bargainbooks.co.za',
      isActive: true,
    },
    {
      name: 'Exclusive Books',
      discountPct: '45.00',
      sorDays: 90,
      paymentTermsDays: 45,
      paymentDay: 15,
      contactName: 'Lisa Naidoo',
      contactEmail: 'lisa@exclusivebooks.co.za',
      contactPhone: '+27 11 555 2000',
      remittanceEmail: 'remittances@exclusivebooks.co.za',
      isActive: true,
    },
    {
      name: 'Takealot',
      discountPct: '35.00',
      paymentTermsDays: 30,
      contactName: 'Takealot Marketplace',
      contactEmail: 'sellers@takealot.com',
      isActive: true,
    },
    {
      name: 'Xarra Direct (Website)',
      discountPct: '0.00',
      contactName: 'Xarra Books',
      contactEmail: 'orders@xarrabooks.com',
      isActive: true,
    },
  ];

  await db.insert(channelPartners).values(partnerData).onConflictDoNothing();
  console.log(`  Channel partners: ${partnerData.length} records`);

  console.log('\nSeed complete!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
