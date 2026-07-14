export function hasDiffs(match) {
  return Boolean(match?.fields?.some((field) => field.status === 'differs'));
}

export function hasComparisonContext(intakeMatch, directoryMatch) {
  return Boolean(intakeMatch || directoryMatch);
}

export function hasAnyDataDiffs(intakeMatch, directoryMatch) {
  return hasDiffs(intakeMatch) || hasDiffs(directoryMatch);
}

export function differingFields(match) {
  return (match?.fields || []).filter((field) => field.status === 'differs');
}

export function matchingFields(match) {
  return (match?.fields || []).filter((field) => field.status === 'same');
}

export function formatFieldList(labels) {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}
