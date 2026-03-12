import { createDb } from './src/index.js';
import { users } from './src/schema/index.js';

const db = createDb(process.env.DATABASE_URL);

async function checkUsers() {
  const allUsers = await db.select().from(users);
  console.log('Existing users:');
  allUsers.forEach(u => {
    console.log(`  - ${u.email} (${u.name}) - Role: ${u.role}, Active: ${u.isActive}`);
  });
  process.exit(0);
}

checkUsers().catch(console.error);
