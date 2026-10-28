import { Button } from '@portal/ui';
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="pagination" aria-label="Paginação">
      <span role="status">
        {total === 0
          ? 'Nenhum registro'
          : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total.toLocaleString('pt-BR')}`}{' '}
        · Página {page} de {pages}
      </span>
      <div className="actions">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </Button>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Próxima
        </Button>
      </div>
    </nav>
  );
}
