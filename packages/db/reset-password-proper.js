import { createDb } from './src/index.js';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

const db = createDb(process.env.DATABASE_URL);

async function resetPasswordBetterAuth() {
  const email = 'info@xarrabooks.com';
  const newPassword = 'Xarra2026!'; // Temporary password
  
  // Better Auth uses a specific format: salt:hash
  // We need to replicate their password hashing
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(newPassword, salt, 10000, 64, 'sha512').toString('hex');
  const passwordHash = `${salt}:${hash}`;

  try {
    const result = await db.execute(sql`
      UPDATE account 
      SET password = ${passwordHash}, "updatedAt" = NOW()
      WHERE "userId" = (SELECT id FROM "user" WHERE email = ${email})
      AND "providerId" = 'credential'
    `);

    console.log('✅ Password reset successfully!');
    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('  NEW LOGIN CREDENTIALS');
    console.log('═══════════════════════════════════════');
    console.log('');
    console.log(`  Email:    ${email}`);
    console.log(`  Password: ${newPassword}`);
    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('');
    console.log('⚠️  IMPORTANT SECURITY STEPS:');
    console.log('');
    console.log('1. Log in immediately with these credentials');
    console.log('2. Go to your Profile/Account Settings');
    console.log('3. Change this temporary password to something secure');
    console.log('4. Use a password manager to store it safely');
    console.log('');
    console.log('Password requirements:');
    console.log('  • Minimum 8 characters');
    console.log('  • Mix of letters, numbers, and symbols recommended');
    console.log('');
  } catch (error) {
    console.error('❌ Error resetting password:', error.message);
    console.error('Full error:', error);
  }

  process.exit(0);
}

resetPasswordBetterAuth().catch(console.error);
