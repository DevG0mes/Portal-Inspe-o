import { expect, it } from 'vitest';
import { importTable } from './import-table.js';
it('reads question/type rows, quotes and explicit text questions', () => {
  expect(
    importTable(
      '\ufeffPergunta;Tipo\r\n"1. Área, segura?";Escolha\r\n1. Ação Realizada;Texto\r\n3. Tema?;Texto\r\n',
    ),
  ).toEqual({ headers: ['1. Área, segura?', '1. Ação Realizada', '3. Tema?'], textQuestions: [3] });
});
it('rejects unknown types, columns, choice actions and incomplete CSV', () => {
  for (const source of [
    'Pergunta,Tipo\n1. Área?,Número',
    'Pergunta,Tipo,Resposta\n1. Área?,Escolha,Sim',
    'Pergunta,Tipo\n1. Ação Realizada,Escolha',
    'Pergunta,Tipo\n"1. Área?,Escolha',
    'Status,1. Área?\nX,Y',
  ])
    expect(() => importTable(source)).toThrow();
});
