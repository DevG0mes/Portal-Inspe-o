export const PRESENTATION_COOKIE = 'portal_presentation';
export function parsePresentation(value: string | undefined): 'desktop' | 'mobile' | null {
  return value === 'desktop' || value === 'mobile' ? value : null;
}
export function homeFor(role: string) {
  return role === 'COLLABORATOR' ? '/my-work' : '/dashboard';
}
