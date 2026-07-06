export function hasDiffs(match) {
  return Boolean(match?.fields?.some((field) => field.status === 'differs'));
}

export function hasComparisonContext(intakeMatch, directoryMatch) {
  return Boolean(directoryMatch || (intakeMatch && hasDiffs(intakeMatch)));
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

export function getMatchStatusLabel(match, allMatch, kind = 'intake') {
  if (allMatch) {
    if (kind === 'directory') return 'Matches directory record';
    const sameLabels = matchingFields(match).map((field) => field.label);
    if (sameLabels.length === 0) return 'All details match';
    return `${formatFieldList(sameLabels)} match`;
  }

  if (kind === 'intake') {
    return 'View details of difference in data between both requests';
  }

  return 'Some data differs · View details';
}

