import { createAuthClient } from 'better-auth/react';
import { adminClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: '/api',
  plugins: [adminClient()],
});

export const {
  useSession,
  signIn,
  signUp,
  signOut,
} = authClient;
