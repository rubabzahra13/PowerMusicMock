import { isAwaitingManagerSubmission } from './requestTags';

export const AWAITING_MANAGER_LABEL = 'Awaiting partner request';
export const AWAITING_MANAGER_HINT = 'PureGym notification only';

export const isManualEntry = (submittedBy) => submittedBy?.club === 'Manual entry';

export const isAutomatedSubmittedBy = (submittedBy) => submittedBy?.club === 'Auto email';

export const getManagerDisplayName = (submittedBy, tags = []) => {
  if (isAwaitingManagerSubmission(tags)) return AWAITING_MANAGER_LABEL;
  if (isManualEntry(submittedBy)) return 'Admin';
  if (isAutomatedSubmittedBy(submittedBy)) return AWAITING_MANAGER_LABEL;
  return `${submittedBy?.firstName || ''} ${submittedBy?.lastName || ''}`.trim();
};

export function getManagerColumnContent(request) {
  const tags = request?.tags || [];
  if (isAwaitingManagerSubmission(tags)) {
    return {
      primary: AWAITING_MANAGER_LABEL,
      secondary: AWAITING_MANAGER_HINT,
      tertiary: '',
      muted: true,
    };
  }
  const submittedBy = request?.submittedBy;
  return {
    primary: getManagerDisplayName(submittedBy, tags),
    secondary: submittedBy?.email || '',
    tertiary: submittedBy?.club || '',
    muted: false,
  };
}
