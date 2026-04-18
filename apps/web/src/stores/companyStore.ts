import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CompanySlug = 'xarra' | 'billetterie';

export interface CompanyConfig {
  slug: CompanySlug;
  name: string;
  shortName: string;
  logo: string;
  tagline: string;
  accentColor: string;
  accentClass: string;
  industry: string;
  description: string;
}

// Platform branding — update PLATFORM_NAME when a name is decided
export const PLATFORM_NAME = 'Management Hub';
export const PLATFORM_TAGLINE = 'Your unified business management platform';

export const COMPANIES: CompanyConfig[] = [
  {
    slug: 'xarra',
    name: 'Xarra Books',
    shortName: 'Xarra',
    logo: '/XarraBooks-logo.png',
    tagline: 'Publishing & Distribution',
    accentColor: '#b91c1c',
    accentClass: 'bg-red-700',
    industry: 'Publishing',
    description: 'Catalog, distribution, partner orders, royalties, and finance for Xarra Books.',
  },
  {
    slug: 'billetterie',
    name: 'Billetterie Software',
    shortName: 'Billetterie',
    logo: '/Billetterie-logo.png',
    tagline: 'Software Development & Projects',
    accentColor: '#1d4ed8',
    accentClass: 'bg-blue-700',
    industry: 'Software',
    description: 'Project management, timesheets, SOW, and client invoicing for Billetterie Software.',
  },
];

interface CompanyState {
  activeSlug: CompanySlug | null;
  setActiveCompany: (slug: CompanySlug) => void;
  clearCompany: () => void;
}

export const useCompanyStore = create<CompanyState>()(
  persist(
    (set) => ({
      activeSlug: null,
      setActiveCompany: (slug) => set({ activeSlug: slug }),
      clearCompany: () => set({ activeSlug: null }),
    }),
    { name: 'xg-active-company' },
  ),
);

export function getCompanyConfig(slug: CompanySlug | null): CompanyConfig {
  return COMPANIES.find((c) => c.slug === slug) ?? COMPANIES[0];
}
