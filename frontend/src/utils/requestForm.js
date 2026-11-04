import { QUESTION_MAX, TITLE_MAX } from '../constants.js';
import { localInputToIso } from './format.js';

export const EMPTY_FORM = { title: '', clientName: '', microsite: '', questions: [], question: '', expiresAt: '' };

// Client-side checks mirror the server rules for fast feedback; the server remains the authority.
export function validateForm(form, now = new Date()) {
  const errors = {};
  const title = form.title.trim();
  const question = (form.question || '').trim();
  if (!title) errors.title = 'Title is required';
  else if (title.length > TITLE_MAX) errors.title = `Title must be at most ${TITLE_MAX} characters`;
  if (form.questions !== undefined) {
    if (!form.clientName?.trim() || form.clientName.trim().length > 100) errors.clientName = 'Enter a client name of up to 100 characters';
    if (!form.microsite) errors.microsite = 'Select a microsite';
    if (!form.questions.length || form.questions.length > 30 || form.questions.some(q => !q.text?.trim() || q.text.length > QUESTION_MAX)) errors.questions = 'Add between 1 and 30 valid questions';
  } else {
    if (!question) errors.question = 'Question is required';
    else if (question.length > QUESTION_MAX) errors.question = 'Question is too long';
  }
  if (form.expiresAt) {
    const iso = localInputToIso(form.expiresAt);
    if (!iso) errors.expiresAt = 'Enter a valid date and time';
    else if (new Date(iso) <= now) errors.expiresAt = 'Expiration must be in the future';
  }
  return errors;
}
