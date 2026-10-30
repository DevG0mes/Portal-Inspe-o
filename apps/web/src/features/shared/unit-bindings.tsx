'use client';
import { RemotePicker } from './remote-picker';
export function UnitBindings({
  items,
  onChange,
  error,
  id = 'binding-unit',
}: {
  items: { id: string; name: string }[];
  onChange: (items: { id: string; name: string }[]) => void;
  error?: string;
  id?: string;
}) {
  return (
    <fieldset>
      <legend>Unidades de negócio atendidas</legend>
      <RemotePicker
        id={id}
        label="Unidade para vincular"
        endpoint="organization/units"
        value=""
        error={error}
        onChange={(value, name) => {
          if (value && !items.some((item) => item.id === value))
            onChange([...items, { id: value, name }]);
        }}
      />
      <ul className="grant-list">
        {items.map((item) => (
          <li key={item.id}>
            {item.name}{' '}
            <button
              type="button"
              className="text-button"
              onClick={() => onChange(items.filter((row) => row.id !== item.id))}
            >
              Remover vínculo com {item.name}
            </button>
          </li>
        ))}
      </ul>
      <p>
        Selecione cada unidade nas páginas do seletor. Remover vínculo não altera inspeções
        anteriores.
      </p>
    </fieldset>
  );
}
