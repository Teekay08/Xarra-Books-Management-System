import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useSession } from '../lib/auth-client';
import { useCompanyStore, COMPANIES, PLATFORM_NAME, type CompanySlug } from '../stores/companyStore';
import { useProducts } from '../hooks/useProducts';

export function CompanySelector() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { isPending, products, hasNone } = useProducts();
  const setActiveCompany = useCompanyStore((s) => s.setActiveCompany);

  const userName = session?.user?.name?.split(' ')[0] ?? 'there';
  const role = (session?.user as any)?.role?.toLowerCase() ?? '';

  // Auto-route when user has access to exactly one product — skip the selector
  useEffect(() => {
    if (isPending) return;
    if (products.length === 1) {
      const slug = products[0];
      setActiveCompany(slug);
      if (slug === 'xarra') {
        if (role === 'author') navigate('/portal', { replace: true });
        else if (role === 'project_manager') navigate('/pm', { replace: true });
        else navigate('/', { replace: true });
      } else {
        navigate('/billetterie', { replace: true });
      }
    }
  }, [isPending, products.length]);

  function select(slug: CompanySlug) {
    setActiveCompany(slug);
    if (slug === 'xarra') {
      if (role === 'author') navigate('/portal');
      else if (role === 'project_manager') navigate('/pm');
      else navigate('/');
    } else {
      navigate('/billetterie');
    }
  }

  // Show loading while session resolves
  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800">
        <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
      </div>
    );
  }

  // User has no product access at all
  if (hasNone) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 px-4">
        <div className="h-12 w-12 rounded-full bg-red-900/50 flex items-center justify-center text-2xl">⚠</div>
        <h1 className="text-xl font-bold text-white">No product access</h1>
        <p className="text-gray-400 text-sm text-center max-w-xs">
          Your account hasn't been granted access to any product yet. Contact your administrator to get set up.
        </p>
        <button
          onClick={async () => {
            const { signOut } = await import('../lib/auth-client');
            await signOut();
            navigate('/login');
          }}
          className="mt-2 text-sm text-gray-400 hover:text-white underline transition-colors"
        >
          Sign out
        </button>
      </div>
    );
  }

  // Single product — show brief loading while the useEffect redirect fires
  if (products.length === 1) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800">
        <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
      </div>
    );
  }

  // Multiple products — show the selector
  const accessibleCompanies = COMPANIES.filter((c) =>
    products.includes(c.slug as any),
  );

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800">
      {/* Header */}
      <header className="shrink-0 px-8 py-5 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center">
          <span className="text-white font-bold text-sm">XG</span>
        </div>
        <span className="text-white font-semibold text-sm tracking-wide">{PLATFORM_NAME}</span>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="text-center mb-10">
          <p className="text-sm text-gray-500 mb-2">Welcome back,</p>
          <h1 className="text-3xl font-bold text-white mb-3">{userName}</h1>
          <p className="text-gray-400">Choose the company you want to work in</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-2xl mb-10">
          {accessibleCompanies.map((company) => (
            <button
              key={company.slug}
              onClick={() => select(company.slug)}
              className="group relative bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/25 rounded-2xl p-7 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-white/30"
            >
              {/* Top accent line */}
              <div
                className="absolute inset-x-0 top-0 h-px rounded-t-2xl"
                style={{ background: `linear-gradient(90deg, transparent, ${company.accentColor}90, transparent)` }}
              />

              {/* Logo */}
              <div className="mb-4 h-12 flex items-center">
                <img
                  src={company.logo}
                  alt={company.name}
                  className="h-10 max-w-[160px] object-contain"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.style.display = 'none';
                    (img.nextElementSibling as HTMLElement)?.classList.remove('hidden');
                  }}
                />
                <span className="hidden text-lg font-bold text-white">{company.name}</span>
              </div>

              <h2 className="text-base font-semibold text-white mb-1">{company.name}</h2>
              <p
                className="text-xs font-semibold uppercase tracking-widest mb-2"
                style={{ color: company.accentColor }}
              >
                {company.industry}
              </p>
              <p className="text-sm text-gray-500 leading-relaxed">{company.description}</p>

              <div className="mt-6 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-400 group-hover:text-white transition-colors">
                  Open {company.shortName}
                </span>
                <svg
                  className="h-4 w-4 text-gray-600 group-hover:text-white group-hover:translate-x-0.5 transition-all"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-600 text-center max-w-xs">
          You can switch between products at any time from the sidebar.
        </p>
      </main>

      {/* Footer */}
      <footer className="shrink-0 pb-8 text-center">
        <p className="text-xs text-gray-600">
          Powered by{' '}
          <a href="https://tsedemeko.africa" target="_blank" rel="noopener noreferrer"
            className="text-gray-400 hover:text-white font-medium transition-colors">
            Tsedemeko
          </a>
        </p>
      </footer>
    </div>
  );
}
