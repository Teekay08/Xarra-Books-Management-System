import { createDb } from './src/index.js';
import { users } from './src/schema/index.js';
import bcrypt from 'bcryptjs';

const db = createDb(process.env.DATABASE_URL);

async function createAdminUser() {
  const email = 'info@xarrabooks.com';
  const password = 'Admin123!'; // Change this after first login!
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const [newUser] = await db.insert(users).values({
      email,
      name: 'Xarra Admin',
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    }).returning();

    console.log('✅ Admin user created successfully!');
    console.log('');
    console.log('Login Credentials:');
    console.log('==================');
    console.log(`Email:    ${email}`);
    console.log(`Password: ${password}`);
    console.log('');
    console.log('⚠️  IMPORTANT: Please change this password after your first login!');
    console.log('');
  } catch (error) {
    if (error.code === '23505') {
      console.error('❌ User with this email already exists!');
    } else {
      console.error('❌ Error creating user:', error);
    }
  }
  
  process.exit(0);
}

createAdminUser().catch(console.error);
