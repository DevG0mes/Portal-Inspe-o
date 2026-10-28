import type { DefinitionIssue } from '@portal/contracts';
import { Notice } from '@portal/ui';
import { issueLabels } from './model';
export const fieldId = (path: string) => `builder-${path.replaceAll('.', '-')}`;
export function IssueSummary({ issues }: { issues: DefinitionIssue[] }) {
  if (!issues.length) return null;
  return (
    <Notice error>
      <strong>Revise os campos antes de publicar.</strong>
      <ul>
        {issues.map((issue, index) => (
          <li key={`${issue.path}-${index}`}>
            <a
              href={`#${fieldId(issue.path)}`}
              onClick={(event) => {
                const target = document.getElementById(fieldId(issue.path));
                if (target) {
                  event.preventDefault();
                  target.focus();
                  target.scrollIntoView({ block: 'center' });
                }
              }}
            >
              {issueLabels[issue.code] ?? 'Confira este campo.'}{' '}
              <span className="small">
                (
                {issue.path === 'title'
                  ? 'Título do formulário'
                  : issue.path.startsWith('sections')
                    ? 'Conteúdo do formulário'
                    : 'Regra'}
                )
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Notice>
  );
}
