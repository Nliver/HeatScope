import { redirect } from 'next/navigation';

type LegacySearchParams = Record<string, string | string[] | undefined>;

/**
 * The root route is kept as a compatibility entry point. New navigation uses
 * explicit, same-level feature routes under /diagnosis, /knowledge, /models,
 * and /history.
 */
export default async function RootRoute({ searchParams }: { searchParams: Promise<LegacySearchParams> }) {
  const params = await searchParams;
  const legacyView = Array.isArray(params.view) ? params.view[0] : params.view;
  if (legacyView === 'knowledge') redirect('/knowledge');
  if (legacyView === 'models') redirect('/models');
  if (legacyView === 'history') redirect('/history');
  redirect('/diagnosis');
}
