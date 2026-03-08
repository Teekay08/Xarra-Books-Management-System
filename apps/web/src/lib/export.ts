/**
 * Client-side CSV/PDF export utilities.
 */

/** Convert an array of objects to CSV string and trigger download */
export function downloadCsv<T extends Record<string, any>>(
  data: T[],
  columns: { key: string; header: string }[],
  filename: string,
) {
  const headers = columns.map((c) => `"${c.header}"`).join(',');
  const rows = data.map((row) =>
    columns
      .map((c) => {
        const val = row[c.key];
        if (val === null || val === undefined) return '';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      })
      .join(','),
  );
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

/** Fetch a server-generated file (PDF/CSV) and trigger download */
export async function downloadFromApi(url: string, filename: string) {
  const res = await fetch(`/api/v1${url}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Export failed: ${res.statusText}`);
  const blob = await res.blob();
  triggerDownload(blob, filename);
}

/** Build export URL with optional date range query params */
export function exportUrl(base: string, from?: string, to?: string): string {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Print current page (or a specific element) */
export function printPage() {
  window.print();
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
