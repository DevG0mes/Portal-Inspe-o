'use client';
import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { importTable, importQuestions } from '@portal/form-engine';
import { PRIORITIES, type FormTemplateSummary, type FormVersionSnapshot } from '@portal/contracts';
import { Button, Field, Input, Select, Notice } from '@portal/ui';
import { api } from '../../lib/api-client';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { DirtyGuard } from '../shared/dirty-guard';
import { ErrorNotice } from '../shared/error-notice';
import { useHydrated } from '../shared/use-hydrated';
import { RemotePicker } from '../shared/remote-picker';

const priorityLabels = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', CRITICAL: 'Crítica' };
interface Prepared {
  snapshot: FormVersionSnapshot;
  payload: object;
}
export function ImportForm() {
  const [dirty, setDirty] = useState(false);
  const [unit, setUnit] = useState(''),
    [inspectionType, setInspectionType] = useState('');
  const router = useRouter(),
    hydrated = useHydrated(),
    generation = useRef(0);
  const [headers, setHeaders] = useState<string[]>(),
    [name, setName] = useState(''),
    [text, setText] = useState(''),
    [category, setCategory] = useState('EPC'),
    [priority, setPriority] = useState(''),
    [required, setRequired] = useState(true);
  const [prepared, setPrepared] = useState<Prepared>(),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [reading, setReading] = useState(false),
    [error, setError] = useState<unknown>();
  function invalidate() {
    setDirty(true);
    setPrepared(undefined);
    setError(undefined);
  }
  async function file(file?: File) {
    const token = ++generation.current;
    invalidate();
    setHeaders(undefined);
    if (!file) {
      setReading(false);
      return;
    }
    setReading(true);
    try {
      if (file.size > 262144) throw new Error('Selecione um CSV de até 256 KiB.');
      const table = importTable(await file.text());
      if (token !== generation.current) return;
      setHeaders(table.headers);
      setText(table.textQuestions.join(', '));
      setName(
        file.name
          .replace(/\.csv$/i, '')
          .replaceAll('_', ' ')
          .slice(0, 160),
      );
    } catch (failure) {
      if (token === generation.current) setError(failure);
    } finally {
      if (token === generation.current) setReading(false);
    }
  }
  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const fields = [
      ['import-name', !name.trim()],
      ['import-priority', !priority],
      ['import-category', !category.trim()],
    ] as const;
    const invalid = fields.find(([, bad]) => bad);
    if (invalid) {
      setError(new Error('Preencha nome, categoria e prioridade para preparar a prévia.'));
      document.getElementById(invalid[0])?.focus();
      return;
    }
    if (!headers) {
      setError(new Error('Selecione um arquivo CSV.'));
      document.getElementById('import-file')?.focus();
      return;
    }
    if (!unit || !inspectionType) {
      setError(new Error('Selecione unidade e tipo de inspeção.'));
      document.getElementById('import-unit')?.focus();
      return;
    }
    try {
      const textQuestions = text.trim() ? text.split(/[,;\s]+/).map(Number) : [];
      if (
        textQuestions.some((v) => !Number.isInteger(v) || v < 1) ||
        new Set(textQuestions).size !== textQuestions.length
      )
        throw new Error('Informe números de perguntas sem repetição.');
      const options = {
        title: name.trim(),
        textQuestions,
        required,
        category: category.trim(),
        priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
      };
      const snapshot = importQuestions(headers, options, () => crypto.randomUUID());
      setPrepared({
        snapshot,
        payload: {
          importId: crypto.randomUUID(),
          unitIds: [unit],
          inspectionTypeId: inspectionType,
          name: options.title,
          headers,
          textQuestions,
          required,
          category: options.category,
          priority,
        },
      });
    } catch (failure) {
      setError(failure);
    }
  }
  async function submit() {
    if (!prepared || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const created = await api<FormTemplateSummary>('forms/import-csv', {
        method: 'POST',
        body: JSON.stringify(prepared.payload),
      });
      setPrepared(undefined);
      setHeaders(undefined);
      setDirty(false);
      setConfirm(false);
      router.replace(`/admin/forms/${created.id}`);
    } catch (failure) {
      setError(failure);
      setConfirm(false);
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <a className="back-link" href="/admin/forms">
          <span className="back-link-arrow" aria-hidden="true">
            ←
          </span>
          Formulários
        </a>
        <h1>Importar formulário CSV</h1>
        <a href="/models/trabalho-em-altura.csv" download>
          Baixar exemplo de Trabalho em Altura
        </a>
        <p>
          Use um CSV com as colunas Pergunta e Tipo, uma pergunta por linha. Tipos aceitos: Escolha
          e Texto. Não inclua respostas ou dados de inspeções anteriores.
        </p>
      </div>
      <form className="card editor" noValidate onSubmit={preview} aria-busy={busy || reading}>
        <fieldset disabled={!hydrated || busy || confirm || reading}>
          <Field id="import-file" label="Arquivo CSV">
            <Input
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void file(e.target.files?.[0])}
            />
          </Field>
          <Field id="import-name" label="Nome do modelo">
            <Input
              id="import-name"
              value={name}
              maxLength={160}
              onChange={(e) => {
                setName(e.target.value);
                invalidate();
              }}
            />
          </Field>
          <RemotePicker
            id="import-unit"
            label="Unidade"
            endpoint="organization/units"
            value={unit}
            onChange={(id) => {
              setUnit(id);
              setInspectionType('');
              invalidate();
            }}
          />
          {unit && (
            <RemotePicker
              key={unit}
              id="import-inspection-type"
              label="Tipo de inspeção"
              endpoint={`organization/sectors?unitId=${unit}`}
              value={inspectionType}
              onChange={(id) => {
                setInspectionType(id);
                invalidate();
              }}
            />
          )}
          <Field
            id="import-text"
            label="Perguntas de texto identificadas no arquivo"
            hint="Preenchido automaticamente pela coluna Tipo. Ações Realizadas são sempre texto e não aparecem nesta lista."
          >
            <Input
              id="import-text"
              readOnly
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                invalidate();
              }}
            />
          </Field>
          <Field id="import-category" label="Categoria das não conformidades">
            <Input
              id="import-category"
              value={category}
              maxLength={120}
              onChange={(e) => {
                setCategory(e.target.value);
                invalidate();
              }}
            />
          </Field>
          <Field id="import-priority" label="Prioridade inicial das não conformidades">
            <Select
              id="import-priority"
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                invalidate();
              }}
            >
              <option value="">Selecione a prioridade</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {priorityLabels[p]}
                </option>
              ))}
            </Select>
          </Field>
          <label className="check-label">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => {
                setRequired(e.target.checked);
                invalidate();
              }}
            />{' '}
            Perguntas principais obrigatórias
          </label>
          <p>
            “Não” gera ocorrência na categoria e prioridade escolhidas e exige a Ação Realizada da
            mesma referência. Revise cada regra no editor antes de publicar.
          </p>
          <Button type="submit">Preparar prévia</Button>
        </fieldset>
      </form>
      {reading && <Notice>Lendo perguntas e tipos do arquivo…</Notice>}
      {error !== undefined && <ErrorNotice error={error} />}
      {prepared && (
        <section className="card editor">
          <h2>Prévia da importação</h2>
          <p>
            {prepared.snapshot.sections[0]!.questions.length} campos. A publicação será uma ação
            separada no editor.
          </p>
          <ul className="import-preview-list" role="list">
            {prepared.snapshot.sections[0]!.questions.map((q) => (
              <li key={q.id}>
                <strong>{q.label}</strong>
                <p>
                  {q.type === 'TEXT' ? 'Texto' : 'Sim / Não / Não Aplicável'}
                  {q.visibleWhen?.length
                    ? ' · Obrigatória quando a pergunta vinculada for respondida com Não.'
                    : q.required
                      ? ' · Obrigatória.'
                      : ' · Opcional.'}
                </p>
              </li>
            ))}
          </ul>
          <Button disabled={busy} onClick={() => setConfirm(true)}>
            Criar rascunho importado
          </Button>
        </section>
      )}
      <ConfirmDialog
        open={confirm}
        title="Criar este modelo?"
        confirmLabel="Importar como rascunho"
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void submit()}
      >
        <p>
          Um novo rascunho será criado. Modelos existentes e inspeções anteriores serão preservados.
        </p>
      </ConfirmDialog>
      <DirtyGuard dirty={dirty} busy={busy} />
    </>
  );
}
