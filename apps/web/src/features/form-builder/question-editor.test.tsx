// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QuestionEditor } from './question-editor';
import type { FormQuestion } from '@portal/contracts';
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);
const question: FormQuestion = {
  id: 'q',
  label: 'Condição',
  type: 'SELECT',
  required: false,
  options: [{ id: 'a', label: 'A' }],
};
function editor() {
  const change = vi.fn();
  render(
    <QuestionEditor
      question={question}
      path="sections.0.questions.0"
      snapshot={{
        schemaVersion: 1,
        title: 'Ficha',
        sections: [{ id: 's', title: 'Área', questions: [question] }],
      }}
      issues={[]}
      onChange={change}
      onError={vi.fn()}
    />,
  );
  return change;
}
it('does not discard configured options when a type change is cancelled', () => {
  const change = editor();
  fireEvent.change(screen.getByLabelText('Tipo de resposta'), { target: { value: 'TEXT' } });
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar', exact: true }));
  expect(change).not.toHaveBeenCalled();
  expect((screen.getByLabelText('Tipo de resposta') as HTMLSelectElement).value).toBe('SELECT');
});
it('removing an option requires explicit confirmation', () => {
  const change = editor();
  fireEvent.click(screen.getByRole('button', { name: 'Remover opção 1', exact: true }));
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar', exact: true }));
  expect(change.mock.calls[0]?.[0].options).toEqual([]);
});
