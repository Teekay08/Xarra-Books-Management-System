import { useCompanyStore, getCompanyConfig, COMPANIES, type CompanyConfig, type CompanySlug } from '../stores/companyStore';

export type { CompanyConfig, CompanySlug };

export function useCompany() {
  const { activeSlug, setActiveCompany, clearCompany } = useCompanyStore();
  const company = getCompanyConfig(activeSlug);

  return {
    company,
    companies: COMPANIES,
    activeSlug,
    setActiveCompany,
    clearCompany,
    hasSelected: activeSlug !== null,
    isXarra: activeSlug === 'xarra',
    isBilletterie: activeSlug === 'billetterie',
  };
}
