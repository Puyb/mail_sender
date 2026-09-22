export function formatRate(count: number, base: number): string {
  if (base <= 0) return '—';
  const percent = Math.round((count / base) * 100);
  return `${percent}% (${count}/${base})`;
}
