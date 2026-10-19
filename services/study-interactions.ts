import type { DatabaseSync } from 'node:sqlite';
import { noteForCard } from './notes.ts';
import { parseChoices, parseSelection } from './note-types.ts';
import { POSITIVE_INTEGER_PATTERN } from '../constants.ts';
import type { Interaction } from '../models/interaction.ts';
import type { Choice } from '../models/note.ts';

const ANSWER_KINDS: readonly string[] = ['type-answer', 'multiple-choice', 'multiple-select', 'ordering'];

/** Folds case, width variants and runs of whitespace so typed answers compare leniently. */
function normalizeAnswer(text: string): string {
  return text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Works out how a card is answered, from the note that generated it.
 * Cards without a note (or of a note type with no interaction) are `legacy`/reveal-only.
 */
export function interactionForCard(db: DatabaseSync, cardId: number): Interaction {
  const note = noteForCard(db, cardId);
  if (!note) return { kind: 'legacy' };
  const fields = note.fields;
  if (note.type === 'type-answer') return { kind: note.type, answer: fields[1] };
  if (note.type === 'multiple-choice' || note.type === 'multiple-select') {
    const choices = parseChoices(fields[1]!);
    const correctIds = note.type === 'multiple-choice' ? [fields[2]!] : parseSelection(fields[2]!, choices);
    return { kind: note.type, choices, correctIds };
  }
  if (note.type === 'ordering') {
    const correctOrder = parseChoices(fields[1]!);
    // Must match the order shown on the card front (see generateCards).
    const choices = correctOrder.length === 2 ? [...correctOrder].reverse() : [...correctOrder.slice(1), correctOrder[0]!];
    return { kind: note.type, choices, correctIds: correctOrder.map(choice => choice.id) };
  }
  return { kind: note.type };
}

/** Turns "2, b" into choice IDs: a number picks the choice at that 1-based position, anything else is taken as an ID. */
function parseEnteredIds(text: string, choices: readonly Choice[]): string[] {
  return text.split(',').map(entry => entry.trim()).filter(Boolean).map(entry => {
    if (POSITIVE_INTEGER_PATTERN.test(entry)) return choices[Number(entry) - 1]?.id ?? entry;
    return entry;
  });
}

/**
 * Checks a typed or chosen answer against the card's interaction.
 *
 * @returns Whether it was correct, and the expected answer as text.
 * @throws {Error} If the interaction has no answer to check.
 */
export function evaluateAnswer(interaction: Interaction, text: string): { correct: boolean; expected: string } {
  if (interaction.kind === 'type-answer') {
    const expected = interaction.answer ?? '';
    return { correct: normalizeAnswer(text) === normalizeAnswer(expected), expected };
  }
  if (!interaction.choices || !interaction.correctIds) {
    throw new Error('This note type does not have a structured answer interaction.');
  }
  const entered = parseEnteredIds(text, interaction.choices);
  const required = interaction.correctIds;
  const sameLength = entered.length === required.length;
  const correct = interaction.kind === 'ordering'
    ? sameLength && entered.every((id, i) => id === required[i])
    : sameLength && new Set(entered).size === entered.length && entered.every(id => required.includes(id));
  const expected = required.map(id => interaction.choices!.find(choice => choice.id === id)?.text ?? id).join(', ');
  return { correct, expected };
}

/** Whether the card asks for an answer before it can be revealed and rated. */
export function needsAnswerInput(interaction: Interaction): boolean {
  return ANSWER_KINDS.includes(interaction.kind);
}

export function answerPrompt(interaction: Interaction): string {
  switch (interaction.kind) {
    case 'type-answer':
      return 'Type your answer (or /skip, /quit): ';
    case 'multiple-choice':
      return 'Choose one option number or ID (or /skip, /quit): ';
    case 'multiple-select':
      return 'Choose option numbers or IDs separated by commas (or /skip, /quit): ';
    case 'ordering':
      return 'Enter the option numbers or IDs in correct order, comma-separated (or /skip, /quit): ';
    default:
      return 'Answer: ';
  }
}
