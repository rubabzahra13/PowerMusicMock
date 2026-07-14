export const MANAGER_NOTES_EMPTY_LABEL = 'No notes.';

export function readManagerNotes(source) {
  if (!source) return '';
  const raw = source.managerNotes ?? source.notes ?? '';
  return String(raw).trim();
}

export function formatManagerNotes(source) {
  return readManagerNotes(source) || MANAGER_NOTES_EMPTY_LABEL;
}

export function managerNotesIsEmpty(source) {
  return !readManagerNotes(source);
}
