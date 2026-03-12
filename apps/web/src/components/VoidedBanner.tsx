interface VoidedBannerProps {
  voidedAt: string;
  voidedReason?: string | null;
}

export function VoidedBanner({ voidedAt, voidedReason }: VoidedBannerProps) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 mb-6">
      <p className="text-sm font-medium text-red-700">Voided</p>
      <p className="text-sm text-red-600 mt-1">
        {new Date(voidedAt).toLocaleDateString('en-ZA')}
      </p>
      {voidedReason && (
        <p className="text-sm text-red-600 mt-1">{voidedReason}</p>
      )}
    </div>
  );
}
