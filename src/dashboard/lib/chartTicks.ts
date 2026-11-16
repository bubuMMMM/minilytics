/** Evenly spaced indices that always include the first and last point, without duplicates. */
export function evenIndices(n: number, maxTicks: number): number[] {
  if (n <= 0) return [];
  const cap = Math.max(2, maxTicks);
  if (n <= cap) return Array.from({ length: n }, (_, i) => i);
  const out = [0];
  const inner = cap - 2;
  for (let k = 1; k <= inner; k++) out.push(Math.round((k * (n - 1)) / (inner + 1)));
  out.push(n - 1);
  return [...new Set(out)].sort((a, b) => a - b);
}
