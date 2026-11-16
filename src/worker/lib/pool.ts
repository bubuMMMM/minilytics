/** Run `fn` over items with a concurrency cap and a wall-clock budget (Vercel cron). */
export async function mapBudget<T, R>(
  items: T[],
  concurrency: number,
  budgetMs: number,
  fn: (item: T) => Promise<R>,
  now = Date.now(),
): Promise<{ results: R[]; remaining: number }> {
  const deadline = now + budgetMs;
  const results: R[] = [];
  let index = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, async () => {
    while (true) {
      if (Date.now() >= deadline) break;
      const i = index++;
      if (i >= items.length) break;
      results.push(await fn(items[i]));
    }
  });
  if (items.length) await Promise.all(workers);
  return { results, remaining: Math.max(0, items.length - results.length) };
}
