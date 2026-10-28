import { z } from 'zod';
import { FORM_STATES, PRIORITIES, QUESTION_TYPES } from '@portal/contracts';
import { paginationShape, parseInput, searchQuery } from '../../common/input.js';

const scalar = z.union([z.string().max(10000), z.number().finite()]);
const predicate = z
  .object({
    operator: z.enum(['EQ', 'NEQ', 'IN']),
    value: z.union([scalar, z.array(scalar).min(1).max(100)]),
  })
  .strict();
const question = z
  .object({
    id: z.uuid(),
    label: z.string().max(240),
    type: z.enum(QUESTION_TYPES),
    required: z.boolean(),
    options: z
      .array(z.object({ id: z.uuid(), label: z.string().max(160) }).strict())
      .max(100)
      .optional(),
    visibleWhen: z
      .array(predicate.extend({ questionId: z.uuid() }))
      .max(20)
      .optional(),
    nonconformity: predicate
      .extend({ category: z.string().max(120), priority: z.enum(PRIORITIES) })
      .optional(),
  })
  .strict();

// Structural validation allows incomplete drafts; publication performs semantic validation.
const snapshot = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().max(240),
    sections: z
      .array(
        z
          .object({
            id: z.uuid(),
            title: z.string().max(200),
            questions: z.array(question).max(500),
          })
          .strict(),
      )
      .max(50),
  })
  .strict()
  .refine(
    (value) =>
      value.sections.reduce((total, section) => total + section.questions.length, 0) <= 500,
  );
const revision = z.number().int().positive().max(2147483646);
const answers = z
  .array(z.object({ questionId: z.uuid(), value: scalar.nullable() }).strict())
  .max(500);

export const parseCreateForm = (input: unknown) =>
  parseInput(
    z
      .object({
        name: z
          .string()
          .trim()
          .min(1)
          .max(160)
          .transform((value) => value.normalize('NFC')),
      })
      .strict(),
    input,
  );
export const parseFormQuery = (input: unknown) =>
  parseInput(
    z
      .object({ ...paginationShape, q: searchQuery, state: z.enum(FORM_STATES).optional() })
      .strict(),
    input,
  );
export const parseRevision = (input: unknown) => parseInput(z.object({ revision }).strict(), input);
export const parseSaveDraft = (input: unknown) =>
  parseInput(z.object({ revision, snapshot }).strict(), input);
export const parsePreview = (input: unknown) =>
  parseInput(z.object({ revision, answers }).strict(), input);
export const parseVersionNumber = (input: unknown) =>
  parseInput(z.coerce.number().int().positive().max(2147483647), input);
