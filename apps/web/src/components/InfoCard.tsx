interface InfoCardProps {
  label: string;
  value: string;
  color?: 'green' | 'red';
}

export function InfoCard({ label, value, color }: InfoCardProps) {
  const textColor = color === 'green' ? 'text-green-600' : color === 'red' ? 'text-red-600' : 'text-gray-900';
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500 uppercase">{label}</p>
      <p className={`text-lg font-bold mt-1 ${textColor}`}>{value}</p>
    </div>
  );
}
