import { createDb } from './src/index.js';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

const db = createDb(process.env.DATABASE_URL);

async function resetPassword() {
  const email = 'info@xarrabooks.com';
  const newPassword = 'Xarra2026!'; // Temporary password
  
  // Better Auth uses Argon2 or bcrypt for password hashing
  // We'll need to hash this properly
  const bcrypt = await import('bcrypt');
  const passwordHash = await bcrypt.hash(newPassword, 10);

  try {
    await db.execute(sql`
      UPDATE "user" 
      SET password = ${passwordHash}
      WHERE email = ${email}
    `);

    console.log('✅ Password reset successfully!');
    console.log('');
    console.log('New Login Credentials:');
    console.log('======================');
    console.log(`Email:    ${email}`);
    console.log(`Password: ${newPassword}`);
    console.log('');
    console.log('⚠️  IMPORTANT: Please change this password immediately after logging in!');
    console.log('   Go to Settings → User Management → Your Profile → Change Password');
    console.log('');
  } catch (error) {
    console.error('❌ Error resetting password:', error.message);
  }

  process.exit(0);
}

resetPassword().catch(console.error);
