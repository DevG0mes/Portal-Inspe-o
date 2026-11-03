/** Standard CSV schema: one question per row, explicit Escolha/Texto type. */
export function importTable(source: string): { headers: string[]; textQuestions: number[] } {
  if (source.length > 262144) throw new Error('O arquivo excede o limite de 256 KiB.');
  const input = source.replace(/^\ufeff/u, '');
  const first = input.split(/\r?\n/u)[0] ?? '';
  const delimiter = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false;
  const finishField = () => {
    row.push(field.normalize('NFC').replace(/\s+/gu, ' ').trim());
    field = '';
    closed = false;
  };
  const finishRow = () => {
    finishField();
    if (row.some(Boolean)) rows.push(row);
    row = [];
    if (rows.length > 501) throw new Error('O arquivo excede 500 perguntas.');
  };
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === delimiter) finishField();
    else if (c === '\r' || c === '\n') {
      finishRow();
      if (c === '\r' && input[i + 1] === '\n') i++;
    } else if (c === '"') {
      if (field.trim() || closed) throw new Error('Aspas inválidas no CSV.');
      field = '';
      quoted = true;
    } else {
      if (closed && c.trim()) throw new Error('Conteúdo após fechamento de aspas.');
      field += c;
    }
  }
  if (quoted) throw new Error('Aspas não encerradas no CSV.');
  finishRow();
  const header = rows.shift();
  if (
    header?.length !== 2 ||
    header[0]?.toLowerCase() !== 'pergunta' ||
    header[1]?.toLowerCase() !== 'tipo'
  )
    throw new Error('Use somente as colunas Pergunta e Tipo, nesta ordem.');
  if (!rows.length) throw new Error('Inclua pelo menos uma pergunta.');
  const headers: string[] = [],
    textQuestions: number[] = [];
  for (const [index, cells] of rows.entries()) {
    if (cells.length !== 2) throw new Error(`Linha ${index + 2}: preencha Pergunta e Tipo.`);
    const [label, rawType] = cells;
    const type = rawType!.toLowerCase(),
      match = /^(\d+)[.)]\s*(.+)$/u.exec(label!);
    if (!match || !['escolha', 'texto'].includes(type))
      throw new Error(`Linha ${index + 2}: use pergunta numerada e tipo Escolha ou Texto.`);
    const action = /^a(?:ç|c)(?:ã|a)o realizada$|^a(?:ç|c)(?:õ|o)es realizadas$/iu.test(match[2]!);
    if (action && type !== 'texto')
      throw new Error(`Linha ${index + 2}: Ação Realizada deve ser Texto.`);
    headers.push(label!);
    if (!action && type === 'texto') textQuestions.push(Number(match[1]));
  }
  return { headers, textQuestions };
}
