import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router';
import { signIn, signOut } from '../lib/auth-client';
import { PLATFORM_NAME } from '../stores/companyStore';

const roles = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'PROJECT_MANAGER', label: 'Project Manager' },
  { value: 'AUTHOR', label: 'Author' },
  { value: 'STAFF', label: 'Staff' },
];

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!role) {
      setError('Please select your role');
      return;
    }

    setLoading(true);

    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message || 'Invalid credentials');
        return;
      }

      const userRole = (result.data?.user?.role as string)?.toLowerCase();
      const selectedRole = role.toLowerCase();

      if (userRole !== selectedRole) {
        await signOut();
        setError('The selected role does not match your account. Please select the correct role.');
        return;
      }

      // Always go to company selector — it will route based on role + active company
      navigate('/select-company');
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="mx-auto h-12 w-12 rounded-xl bg-gray-900 flex items-center justify-center mb-4">
              <span className="text-white font-bold text-lg">XG</span>
            </div>
            <h1 className="text-lg font-bold text-gray-900">{PLATFORM_NAME}</h1>
            <p className="text-sm text-gray-500 mt-1">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <select
                id="role"
                required
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={`${inputCls} ${!role ? 'text-gray-400' : 'text-gray-900'}`}
              >
                <option value="" disabled>Select your role</option>
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="you@xarrabooks.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <Link to="/forgot-password" className="text-xs text-green-700 hover:text-green-800 font-medium">
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-green-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-400">
            Credentials are provided by your administrator
          </p>
        </div>
        <div className="text-center mt-6 space-y-1">
          <p className="text-xs text-white/30">
            <Link to="/" className="hover:text-white/60 transition-colors">← Back to platform</Link>
          </p>
          <p className="text-xs text-white/25">
            Powered by{' '}
            <a href="https://tsedemeko.africa" target="_blank" rel="noopener noreferrer" className="hover:text-white/50 transition-colors font-medium">
              Tsedemeko
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
