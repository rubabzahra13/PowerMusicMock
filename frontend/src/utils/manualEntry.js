export const isManualEntry = (submittedBy) => submittedBy?.club === 'Manual entry';

export const getManagerDisplayName = (submittedBy) => {
  if (isManualEntry(submittedBy)) return 'Admin';
  return `${submittedBy?.firstName || ''} ${submittedBy?.lastName || ''}`.trim();
};
