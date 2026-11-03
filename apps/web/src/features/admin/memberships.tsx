'use client';
import { useState } from 'react';
import Link from 'next/link';
import type {
  Paginated,
  SectorMembershipSummary,
  UnitMembershipSummary,
  UserSummary,
} from '@portal/contracts';
import { Badge, Button, Notice, Skeleton } from '@portal/ui';
import { api } from '../../lib/api-client';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { ErrorNotice } from '../shared/error-notice';
import { Pagination } from '../shared/pagination';
import { RemotePicker } from '../shared/remote-picker';
import { useResource } from '../shared/use-resource';
type Grant = UnitMembershipSummary & { sectorId?: string; sectorName?: string };
interface Action {
  endpoint: string;
  method: 'PATCH' | 'POST';
  body: object;
  name: string;
  description: string;
}
export function Memberships({ userId }: { userId: string }) {
  const [revision, setRevision] = useState(0);
  const user = useResource<UserSummary>(`users/${userId}`, revision);
  const [unitPage, setUnitPage] = useState(1);
  const [sectorPage, setSectorPage] = useState(1);
  const [unitId, setUnitId] = useState('');
  const [unitName, setUnitName] = useState('');
  const [grantUnit, setGrantUnit] = useState('');
  const [grantUnitName, setGrantUnitName] = useState('');
  const [grantSector, setGrantSector] = useState('');
  const [grantSectorName, setGrantSectorName] = useState('');
  const units = useResource<Paginated<UnitMembershipSummary>>(
    `organization/unit-memberships?userId=${userId}&pageSize=10&page=${unitPage}`,
    revision,
  );
  const sectors = useResource<Paginated<SectorMembershipSummary>>(
    unitId
      ? `organization/sector-memberships?userId=${userId}&unitId=${unitId}&pageSize=10&page=${sectorPage}`
      : null,
    revision,
  );
  const [action, setAction] = useState<Action>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [success, setSuccess] = useState('');
  function prepare(next: Action) {
    setError(undefined);
    setAction(next);
  }
  async function perform() {
    if (!action || busy) return;
    setBusy(true);
    try {
      await api(action.endpoint, { method: action.method, body: JSON.stringify(action.body) });
      setAction(undefined);
      setSuccess('Vínculo atualizado com sucesso.');
      setRevision(revision + 1);
      setGrantSector('');
      setGrantUnit('');
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  function toggle(grant: Grant, sector = false) {
    prepare({
      endpoint: `organization/${sector ? 'sector' : 'unit'}-memberships/${grant.id}`,
      method: 'PATCH',
      body: { isActive: !grant.isActive },
      name: `${grant.isActive ? 'Revogar' : 'Reativar'} vínculo: ${sector ? grant.sectorName : grant.unitName}`,
      description: sector
        ? 'O acesso ao tipo de inspeção depende também da situação do usuário, da unidade e do vínculo de unidade.'
        : grant.isActive
          ? 'Revogar o vínculo de unidade também revoga todos os vínculos de tipos de inspeção desta unidade. O histórico será preservado.'
          : 'Reativar a unidade não reativa os vínculos de tipos de inspeção. Cada tipo de inspeção deverá ser autorizado novamente.',
    });
  }
  function rows(data: Grant[], sector = false) {
    return (
      <ul className="grant-list">
        {data.map((grant) => (
          <li key={grant.id}>
            <div>
              <strong>{sector ? grant.sectorName : grant.unitName}</strong>
              <Badge active={grant.isActive} />
            </div>
            <div className="actions">
              {!sector && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setUnitId(grant.unitId);
                    setUnitName(grant.unitName);
                    setSectorPage(1);
                    setGrantSector('');
                  }}
                >
                  Ver tipos de inspeção<span className="sr-only"> de {grant.unitName}</span>
                </Button>
              )}
              <Button
                variant="secondary"
                disabled={!user.data?.isActive && !grant.isActive}
                onClick={() => toggle(grant, sector)}
              >
                {grant.isActive ? 'Revogar' : 'Reativar'}
                <span className="sr-only"> {sector ? grant.sectorName : grant.unitName}</span>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    );
  }
  if (user.loading) return <Skeleton />;
  if (user.error)
    return (
      <>
        <ErrorNotice error={user.error} />
        <Button variant="secondary" onClick={() => setRevision(revision + 1)}>
          Tentar novamente
        </Button>
      </>
    );
  return (
    <>
      <div className="page-heading">
        <Link className="back-link" href="/users">
          <span className="back-link-arrow" aria-hidden="true">
            ←
          </span>
          Usuários
        </Link>
        <h1>Vínculos de acesso</h1>
        <p>
          {user.data?.name} · {user.data?.email}
        </p>
      </div>
      {success && <Notice>{success}</Notice>}
      {user.data?.role === 'ADMIN' && (
        <Notice>
          Este usuário é administrador e tem acesso global. Os vínculos definem o escopo quando o
          perfil depende deles.
        </Notice>
      )}
      {!user.data?.isActive && (
        <Notice>Usuário inativo. Ative o usuário antes de conceder novos acessos.</Notice>
      )}
      <div className="membership-grid">
        <section className="card">
          <h2>Unidades vinculadas</h2>
          <p>
            Uma pessoa pode pertencer a várias unidades. Tipos de inspeção precisam de autorização
            própria.
          </p>
          {units.loading ? (
            <Skeleton />
          ) : units.error ? (
            <>
              <ErrorNotice error={units.error} />
              <Button variant="secondary" onClick={() => setRevision(revision + 1)}>
                Tentar novamente
              </Button>
            </>
          ) : (
            <>
              {units.data?.data.length ? rows(units.data.data) : <p>Nenhuma unidade vinculada.</p>}
              <Pagination
                page={unitPage}
                pageSize={10}
                total={units.data?.total ?? 0}
                onPage={setUnitPage}
              />
            </>
          )}
          <div className="grant-add">
            <h3>Adicionar unidade</h3>
            <RemotePicker
              id="grant-unit"
              label="Unidade"
              endpoint="organization/units"
              value={grantUnit}
              disabled={!user.data?.isActive}
              onChange={(id, name) => {
                setGrantUnit(id);
                setGrantUnitName(name);
              }}
            />
            <Button
              disabled={!grantUnit || !user.data?.isActive}
              onClick={() =>
                prepare({
                  endpoint: 'organization/unit-memberships',
                  method: 'POST',
                  body: { userId, unitId: grantUnit },
                  name: `Vincular ${grantUnitName}?`,
                  description:
                    'Esta autorização habilita a unidade. Os tipos de inspeção devem ser vinculados separadamente.',
                })
              }
            >
              Vincular unidade
            </Button>
          </div>
        </section>
        <section className="card">
          <h2>{unitId ? `Tipos de inspeção · ${unitName}` : 'Tipos de inspeção vinculados'}</h2>
          {!unitId ? (
            <div className="empty-state">
              <p>Escolha “Ver tipos de inspeção” em uma unidade vinculada.</p>
            </div>
          ) : (
            <>
              {sectors.loading ? (
                <Skeleton />
              ) : sectors.error ? (
                <>
                  <ErrorNotice error={sectors.error} />
                  <Button variant="secondary" onClick={() => setRevision(revision + 1)}>
                    Tentar novamente
                  </Button>
                </>
              ) : (
                <>
                  {sectors.data?.data.length ? (
                    rows(sectors.data.data, true)
                  ) : (
                    <p>Nenhum tipo de inspeção vinculado nesta unidade.</p>
                  )}
                  <Pagination
                    page={sectorPage}
                    pageSize={10}
                    total={sectors.data?.total ?? 0}
                    onPage={setSectorPage}
                  />
                </>
              )}
              <div className="grant-add">
                <h3>Adicionar tipo de inspeção</h3>
                <RemotePicker
                  key={unitId}
                  id="grant-sector"
                  label="Tipo de inspeção"
                  endpoint={`organization/sectors?unitId=${unitId}`}
                  value={grantSector}
                  disabled={!user.data?.isActive}
                  onChange={(id, name) => {
                    setGrantSector(id);
                    setGrantSectorName(name);
                  }}
                />
                <Button
                  disabled={!grantSector || !user.data?.isActive}
                  onClick={() =>
                    prepare({
                      endpoint: 'organization/sector-memberships',
                      method: 'POST',
                      body: { userId, unitId, sectorId: grantSector },
                      name: `Vincular ${grantSectorName}?`,
                      description: `A pessoa terá acesso a este tipo de inspeção de ${unitName}, desde que a unidade e o vínculo de unidade estejam ativos.`,
                    })
                  }
                >
                  Vincular tipo de inspeção
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={!!action}
        title={action?.name ?? 'Atualizar vínculo'}
        busy={busy}
        onCancel={() => setAction(undefined)}
        onConfirm={perform}
      >
        <p>{action?.description}</p>
        {error !== undefined && <ErrorNotice error={error} />}
      </ConfirmDialog>
    </>
  );
}
