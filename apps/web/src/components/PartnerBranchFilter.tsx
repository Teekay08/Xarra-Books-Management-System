import { useEffect, useState } from 'react';
import { partnerApi, getPartnerUser } from '../lib/partner-api';

interface Branch {
  id: string;
  name: string;
  code: string | null;
}

interface PartnerBranchFilterProps {
  value: string;
  onChange: (branchId: string) => void;
}

export function PartnerBranchFilter({ value, onChange }: PartnerBranchFilterProps) {
  const user = getPartnerUser();
  const isHq = !user?.branchId;
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    if (!isHq) return;
    partnerApi<{ data: Branch[] }>('/branches')
      .then((res) => setBranches(res.data))
      .catch(() => {});
  }, [isHq]);

  if (!isHq || branches.length === 0) return null;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
    >
      <option value="">All Branches</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}{b.code ? ` (${b.code})` : ''}
        </option>
      ))}
    </select>
  );
}
