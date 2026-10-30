import type { FormQuestion, FormVersionSnapshot, NonconformityRule } from '@portal/contracts';

const clean = (text: string) => text.normalize('NFC').replace(/\s+/gu, ' ').trim();
const key = (text: string) => clean(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export interface ImportOptions {
  title: string;
  textQuestions: number[];
  required: boolean;
  category: string;
  priority: NonconformityRule['priority'];
}

/** Read the first logical record only. Historical responses never enter the import payload. */
export function csvHeaders(source: string): string[] {
  if (source.length > 262144) throw new Error('O cabeçalho excede o limite de leitura.');
  const input = source.replace(/^\ufeff/u, '');
  let quoted = false,
    end = input.length;
  const counts = new Map([
    [',', 0],
    [';', 0],
    ['\t', 0],
  ]);
  for (let index = 0; index < input.length; index++) {
    const char = input[index]!;
    if (char === '"') {
      if (quoted && input[index + 1] === '"') index++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === '\n' || char === '\r') {
        end = index;
        break;
      }
      if (counts.has(char)) counts.set(char, counts.get(char)! + 1);
    }
  }
  if (quoted) throw new Error('Cabeçalho com aspas não encerradas.');
  const delimiter = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
  const headers: string[] = [];
  let field = '',
    closed = false;
  quoted = false;
  for (let index = 0; index < end; index++) {
    const char = input[index]!;
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += char;
    } else if (char === delimiter) {
      headers.push(clean(field));
      field = '';
      closed = false;
    } else if (char === '"') {
      if (field.trim() || closed) throw new Error('Aspas inválidas no cabeçalho.');
      field = '';
      quoted = true;
    } else {
      if (closed && char.trim()) throw new Error('Conteúdo depois do fechamento de aspas.');
      field += char;
    }
  }
  headers.push(clean(field));
  if (headers.length > 504 || headers.some((header) => !header))
    throw new Error('Cabeçalho vazio ou acima do limite de colunas.');
  return headers;
}

/** Numbered references are explicit; unknown columns and lost action fields are rejected. */
export function importQuestions(
  headers: string[],
  options: ImportOptions,
  id: () => string,
): FormVersionSnapshot {
  if (!headers.length || headers.length > 504) throw new Error('Quantidade de colunas inválida.');
  const primary = new Map<number, string>(),
    actions = new Map<number, string>();
  const metadata = new Set(['status', 'protocolo', 'criado', 'criado por']);
  let previous = 0;
  for (const raw of headers) {
    const label = clean(raw),
      match = /^(\d+)[.)]\s*(.+)$/u.exec(label);
    if (!match) {
      if (metadata.has(key(label))) continue;
      throw new Error(`Coluna não reconhecida: ${label.slice(0, 100)}.`);
    }
    const number = Number(match[1]);
    if (!Number.isSafeInteger(number) || number < 1 || number > 500 || label.length > 240)
      throw new Error('Número ou tamanho de pergunta inválido.');
    const action = ['acao realizada', 'acoes realizadas'].includes(key(match[2]!));
    const target = action ? actions : primary;
    if (target.has(number)) throw new Error(`Referência ${number} duplicada.`);
    if (!action && number <= previous)
      throw new Error('As perguntas devem estar em ordem crescente.');
    if (!action) previous = number;
    target.set(number, label);
  }
  if (!primary.size || options.textQuestions.some((number) => !primary.has(number)))
    throw new Error('As referências de texto devem existir no arquivo.');
  for (const number of actions.keys())
    if (!primary.has(number) || options.textQuestions.includes(number))
      throw new Error(`Ação ${number} sem pergunta de escolha correspondente.`);
  const questions: FormQuestion[] = [];
  for (const [number, label] of primary) {
    const text = options.textQuestions.includes(number),
      questionId = id();
    questions.push({
      id: questionId,
      label,
      type: text ? 'TEXT' : 'YES_NO_NA',
      required: options.required,
      ...(!text
        ? {
            nonconformity: {
              operator: 'EQ' as const,
              value: 'NO',
              category: options.category,
              priority: options.priority,
            },
          }
        : {}),
    });
    if (!text) {
      const action = actions.get(number);
      if (!action) throw new Error(`Falta a Ação Realizada da pergunta ${number}.`);
      questions.push({
        id: id(),
        label: action,
        type: 'TEXT',
        required: true,
        visibleWhen: [{ questionId, operator: 'EQ', value: 'NO' }],
      });
    }
  }
  if (questions.length > 500) throw new Error('O modelo excede 500 campos.');
  return {
    schemaVersion: 1,
    title: options.title,
    sections: [{ id: id(), title: 'Verificação de segurança', questions }],
  };
}
