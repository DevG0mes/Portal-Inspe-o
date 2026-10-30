import type { InspectionContext } from '@portal/contracts';
export function IdentificationSummary({ context }: { context?: InspectionContext | null }) {
  if (!context) return null;
  return (
    <section className="card">
      <h2>Identificação da inspeção</h2>
      <dl className="inspection-record">
        <div>
          <dt>Cliente</dt>
          <dd>{context.customerName}</dd>
        </div>
        <div>
          <dt>Local</dt>
          <dd>{context.locationName}</dd>
        </div>
        <div>
          <dt>Participantes</dt>
          <dd>
            {context.participants.length
              ? context.participants.join(', ')
              : 'Nenhum participante adicional.'}
          </dd>
        </div>
      </dl>
    </section>
  );
}
