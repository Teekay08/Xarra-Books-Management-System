/**
 * Format a number or numeric string as South African Rand.
 * e.g. formatR(1234.5) => "R 1,234.50"
 */
export function formatR(val: string | number): string {
  return `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
