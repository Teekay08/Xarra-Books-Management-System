import { createDb } from './src/index.js';
import { sql } from 'drizzle-orm';

const db = createDb(process.env.DATABASE_URL);

async function checkUserSchema() {
  const result = await db.execute(sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'user'
    ORDER BY ordinal_position;
  `);
  
  console.log('Columns in "user" table:');
  result.forEach(row => {
    console.log(`  - ${row.column_name}: ${row.data_type}`);
  });

  // Get a sample user
  const users = await db.execute(sql`SELECT * FROM "user" WHERE email = 'info@xarrabooks.com' LIMIT 1`);
  console.log('\nSample user data:');
  console.log(JSON.stringify(users[0], null, 2));

  process.exit(0);
}

checkUserSchema().catch(console.error);
