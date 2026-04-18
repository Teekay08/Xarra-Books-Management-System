import { Link } from 'react-router';
import { PLATFORM_NAME, PLATFORM_TAGLINE, COMPANIES } from '../stores/companyStore';

export function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800">
      {/* Top nav */}
      <header className="shrink-0 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Placeholder logo mark — replace with real group logo when available */}
          <div className="h-9 w-9 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center">
            <span className="text-white font-bold text-sm">XG</span>
          </div>
          <span className="text-white font-semibold text-sm tracking-wide">{PLATFORM_NAME}</span>
        </div>
        <Link
          to="/login"
          className="rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors"
        >
          Sign In
        </Link>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-gray-400 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            Unified Group Management Platform
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold text-white tracking-tight leading-tight mb-5">
            Welcome to<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">
              {PLATFORM_NAME}
            </span>
          </h1>
          <p className="text-lg text-gray-400 leading-relaxed">{PLATFORM_TAGLINE}</p>
        </div>

        {/* Company Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-2xl mb-12">
          {COMPANIES.map((company) => (
            <Link
              key={company.slug}
              to="/login"
              className="group relative bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/25 rounded-2xl p-7 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl"
            >
              <div
                className="absolute inset-x-0 top-0 h-px rounded-t-2xl"
                style={{ background: `linear-gradient(90deg, transparent, ${company.accentColor}80, transparent)` }}
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
                    img.nextElementSibling?.classList.remove('hidden');
                  }}
                />
                <span className="hidden text-lg font-bold text-white">{company.name}</span>
              </div>

              <h2 className="text-base font-semibold text-white mb-1">{company.name}</h2>
              <p className="text-xs text-gray-400 mb-1 font-medium uppercase tracking-wide">{company.industry}</p>
              <p className="text-sm text-gray-500 leading-relaxed">{company.description}</p>

              <div className="mt-5 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400 group-hover:text-white transition-colors">
                  Open {company.shortName} →
                </span>
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: company.accentColor }}
                />
              </div>
            </Link>
          ))}
        </div>

        {/* Shared resources note */}
        <p className="text-sm text-gray-600 text-center max-w-sm">
          Staff members, timesheets, and financial tools are shared across both companies.
          Switch between companies at any time from within the platform.
        </p>
      </main>

      {/* Footer */}
      <footer className="shrink-0 pb-8 text-center">
        <p className="text-xs text-gray-600">
          Powered by{' '}
          <a
            href="https://tsedemeko.africa"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-white font-medium transition-colors"
          >
            Tsedemeko
          </a>
        </p>
      </footer>
    </div>
  );
}
