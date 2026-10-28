import type { ResourceKind } from './config';
/** Only non-sensitive filters are allowed in navigation URLs. No caller supplied redirect. */
export function listDestination(kind: ResourceKind, encoded: string | null, saved = false) {
  const input = new URLSearchParams(encoded ?? '');
  const output = new URLSearchParams();
  const page = Number(input.get('page'));
  if (Number.isInteger(page) && page > 1 && page <= 100000) output.set('page', String(page));
  if (['true', 'false'].includes(input.get('isActive') ?? ''))
    output.set('isActive', input.get('isActive')!);
  if (kind === 'users' && ['ADMIN', 'MANAGER', 'COLLABORATOR'].includes(input.get('role') ?? ''))
    output.set('role', input.get('role')!);
  if (saved) output.set('saved', '1');
  return `/${kind}${output.size ? `?${output}` : ''}`;
}
