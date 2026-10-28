'use client';
import { useState } from 'react';
import type { FormVersionSummary, FormVersionView, Paginated } from '@portal/contracts';
import { Button, Skeleton } from '@portal/ui';
import { ErrorNotice } from '../shared/error-notice';
import { Pagination } from '../shared/pagination';
import { useResource } from '../shared/use-resource';
import { FormPreview } from '../form-preview/form-preview';
export function VersionHistory({ templateId }: { templateId: string }) {
  const [page, setPage] = useState(1);
  const [number, setNumber] = useState<number>();
  const [revision, setRevision] = useState(0);
  const history = useResource<Paginated<FormVersionSummary>>(
    `forms/${templateId}/versions?pageSize=10&page=${page}`,
    revision,
  );
  const selected = useResource<FormVersionView>(
    number ? `forms/${templateId}/versions/${number}` : null,
    revision,
  );
  return (
    <section className="card version-history">
      <h2>Histórico de versões</h2>
      <p className="muted">Cada publicação preserva uma cópia imutável do conteúdo.</p>
      {history.loading ? (
        <Skeleton />
      ) : history.error ? (
        <>
          <ErrorNotice error={history.error} />
          <Button variant="secondary" onClick={() => setRevision(revision + 1)}>
            Tentar novamente
          </Button>
        </>
      ) : (
        history.data && (
          <>
            {!history.data.data.length ? (
              <p>Nenhuma versão publicada.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">Histórico de publicações</caption>
                  <thead>
                    <tr>
                      <th scope="col">Versão</th>
                      <th scope="col">Publicado em</th>
                      <th scope="col">Autor</th>
                      <th scope="col">Conteúdo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data.data.map((version) => (
                      <tr key={version.id}>
                        <td data-label="Versão">{version.number}</td>
                        <td data-label="Publicado em">
                          <time dateTime={version.publishedAt}>
                            {new Intl.DateTimeFormat('pt-BR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                              timeZone: 'America/Sao_Paulo',
                            }).format(new Date(version.publishedAt))}
                          </time>
                        </td>
                        <td data-label="Autor">{version.publishedByName}</td>
                        <td data-label="Conteúdo">
                          <Button variant="secondary" onClick={() => setNumber(version.number)}>
                            Consultar versão {version.number}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination page={page} pageSize={10} total={history.data.total} onPage={setPage} />
          </>
        )
      )}
      {number && (
        <div className="historical-version">
          <h3>Consulta da versão {number}</h3>
          <Button variant="secondary" onClick={() => setNumber(undefined)}>
            Fechar versão
          </Button>
          {selected.loading ? (
            <Skeleton />
          ) : selected.error ? (
            <>
              <ErrorNotice error={selected.error} />
              <Button variant="secondary" onClick={() => setRevision(revision + 1)}>
                Tentar novamente
              </Button>
            </>
          ) : (
            selected.data && <FormPreview key={number} snapshot={selected.data.snapshot} />
          )}
        </div>
      )}
    </section>
  );
}
