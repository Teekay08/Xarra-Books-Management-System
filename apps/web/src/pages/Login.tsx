import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router';
import { signIn, signOut } from '../lib/auth-client';
import { PLATFORM_NAME } from '../stores/companyStore';

const roles = [
  { value: 'ADMIN', label: 'Administrator' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'PROJECT_MANAGER', label: 'Operations / Project Manager' },
  { value: 'AUTHOR', label: 'Author' },
  { value: 'STAFF', label: 'Staff Member' },
];

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole]         = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!role) { setError('Please select your role'); return; }

    setLoading(true);
    try {
      const result = await signIn.email({ email, password });
      if (result.error) { setError(result.error.message || 'Invalid credentials'); return; }

      const userRole     = (result.data?.user?.role as string)?.toLowerCase();
      const selectedRole = role.toLowerCase();

      if (userRole !== selectedRole) {
        await signOut();
        setError('The selected role does not match your account. Please choose the correct role.');
        return;
      }

      navigate('/select-company');
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] relative overflow-hidden">
      {/* Subtle grid background */}
      <div className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '32px 32px' }} />

      {/* Gradient blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-xarra-red/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] bg-blue-600/20 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative w-full max-w-sm mx-4">
        {/* Card */}
        <div className="bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-2xl p-8 shadow-2xl">
          {/* Logo area */}
          <div className="text-center mb-7">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-xarra-red shadow-lg mb-4">
              <span className="text-white font-bold text-base tracking-tight">XG</span>
            </div>
            <h1 className="text-base font-bold text-white">{PLATFORM_NAME}</h1>
            <p className="text-xs text-white/50 mt-1">Sign in to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-xs text-red-300">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="role" className="block text-xs font-medium text-white/60 mb-1.5">Role</label>
              <select
                id="role" required value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white
                           focus:outline-none focus:border-xarra-red/60 focus:ring-1 focus:ring-xarra-red/30
                           transition-colors appearance-none"
              >
                <option value="" disabled className="text-gray-500 bg-gray-900">Select your role…</option>
                {roles.map((r) => (
                  <option key={r.value} value={r.value} className="bg-gray-900">{r.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-medium text-white/60 mb-1.5">Email</label>
              <input
                id="email" type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@xarrabooks.com"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white
                           placeholder:text-white/25 focus:outline-none focus:border-xarra-red/60 focus:ring-1
                           focus:ring-xarra-red/30 transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="text-xs font-medium text-white/60">Password</label>
                <Link to="/forgot-password" className="text-xs text-xarra-red hover:text-xarra-red-light transition-colors">
                  Forgot password?
                </Link>
              </div>
              <input
                id="password" type="password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white
                           placeholder:text-white/25 focus:outline-none focus:border-xarra-red/60 focus:ring-1
                           focus:ring-xarra-red/30 transition-colors"
              />
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full rounded-lg bg-xarra-red px-4 py-2.5 text-sm font-semibold text-white
                         hover:bg-xarra-red-dark focus:outline-none disabled:opacity-50
                         disabled:cursor-not-allowed transition-all shadow-lg shadow-xarra-red/20 mt-1"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Signing in…
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          <p className="mt-5 text-center text-[11px] text-white/25">
            Credentials are provided by your administrator
          </p>
        </div>

        <p className="text-center mt-5 text-[11px] text-white/25">
          Powered by{' '}
          <a href="https://tsedemeko.africa" target="_blank" rel="noopener noreferrer"
             className="text-white/40 hover:text-white/60 font-medium transition-colors">
            Tsedemeko
          </a>
        </p>
      </div>
    </div>
  );
}
