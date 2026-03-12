import { createDb } from './src/index.js';
import { sql } from 'drizzle-orm';

const db = createDb(process.env.DATABASE_URL);

async function findPasswordTable() {
  // Look for tables that might contain passwords
  const tables = await db.execute(sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  
  console.log('All tables in database:');
  tables.forEach(row => {
    console.log(`  - ${row.table_name}`);
  });

  // Check for account table (Better Auth usually uses this)
  try {
    const accounts = await db.execute(sql`
      SELECT * FROM account 
      WHERE "userId" = (SELECT id FROM "user" WHERE email = 'info@xarrabooks.com')
      LIMIT 1
    `);
    console.log('\nAccount record for info@xarrabooks.com:');
    console.log(JSON.stringify(accounts[0], null, 2));
  } catch (e) {
    console.log('\nNo account table or error:', e.message);
  }

  process.exit(0);
}

findPasswordTable().catch(console.error);
