import { createDb } from './src/index.js';
import { sql } from 'drizzle-orm';

const db = createDb(process.env.DATABASE_URL);

async function checkTables() {
  const result = await db.execute(sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name LIKE '%user%'
    ORDER BY table_name;
  `);
  
  console.log('User-related tables:');
  result.forEach(row => {
    console.log(`  - ${row.table_name}`);
  });

  // Try to query the Better Auth user table
  try {
    const users = await db.execute(sql`SELECT email, name, role FROM "user" LIMIT 10`);
    console.log('\nUsers in "user" table:');
    users.forEach(u => {
      console.log(`  - ${u.email} (${u.name}) - Role: ${u.role}`);
    });
  } catch (e) {
    console.log('\nNo "user" table found or error:', e.message);
  }

  process.exit(0);
}

checkTables().catch(console.error);
