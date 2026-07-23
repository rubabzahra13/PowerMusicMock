export default function Tag({
  variant,
  label,
  compact: _compact = false,
  prefix: prefixOverride,
  wide = false,
}) {
  let bgClass = '';
  let textClass = '';
  let extraClass = '';
  let prefix = prefixOverride ?? '';

  switch (variant) {
    case 'added':
    case 'active':
      bgClass = 'bg-[var(--color-tag-added-bg)]';
      textClass = 'text-[var(--color-tag-added-text)]';
      break;
    case 'removed':
      bgClass = 'bg-[var(--color-tag-removed-bg)]';
      textClass = 'text-[var(--color-tag-removed-text)]';
      break;
    case 'already-exists':
    case 'review-exists':
      bgClass = 'bg-[var(--color-tag-review-exists-bg)]';
      textClass = 'text-[var(--color-tag-review-exists-text)]';
      extraClass = 'ring-1 ring-inset ring-[var(--color-tag-review-exists-border)]';
      if (prefixOverride == null) prefix = '⚠ ';
      break;
    case 'duplicate-confirmed':
      bgClass = 'bg-[var(--color-tag-duplicate-confirmed-bg)]';
      textClass = 'text-[var(--color-tag-duplicate-confirmed-text)]';
      extraClass = 'ring-1 ring-inset ring-[var(--color-tag-duplicate-confirmed-border)]';
      break;
    case 'duplicate-potential':
      bgClass = 'bg-[var(--color-tag-duplicate-potential-bg)]';
      textClass = 'text-[var(--color-tag-duplicate-potential-text)]';
      extraClass = 'ring-1 ring-inset ring-[var(--color-tag-duplicate-potential-border)]';
      break;
    case 'new-person':
      bgClass = 'bg-[var(--color-tag-auto-mail-bg)]';
      textClass = 'text-[var(--color-tag-auto-mail-text)]';
      extraClass = 'ring-1 ring-inset ring-[var(--color-tag-auto-mail-border)]';
      break;
    case 'add-action':
      bgClass = 'bg-[var(--color-tag-add-action-bg)]';
      textClass = 'text-[var(--color-tag-add-action-text)]';
      break;
    case 'remove-action':
      bgClass = 'bg-[var(--color-tag-remove-action-bg)]';
      textClass = 'text-[var(--color-tag-remove-action-text)]';
      break;
    case 'auto-mail':
      bgClass = 'bg-[var(--color-tag-auto-mail-bg)]';
      textClass = 'text-[var(--color-tag-auto-mail-text)]';
      extraClass = 'ring-1 ring-inset ring-[var(--color-tag-auto-mail-border)]';
      break;
    case 'review-mismatch':
    case 'data-mismatch':
      bgClass = 'bg-[var(--color-tag-review-mismatch-bg)]';
      textClass = 'text-[var(--color-tag-review-mismatch-text)]';
      extraClass = 'ring-1 ring-inset ring-[var(--color-tag-review-mismatch-border)]';
      if (prefixOverride == null) prefix = '! ';
      break;
    case 'review-removed':
      bgClass = 'bg-[var(--color-tag-review-removed-bg)]';
      textClass = 'text-[var(--color-tag-review-removed-text)]';
      extraClass = 'ring-1 ring-inset ring-[var(--color-tag-review-removed-border)]';
      if (prefixOverride == null) prefix = '− ';
      break;
    case 'review':
      bgClass = 'bg-[var(--color-tag-review-exists-bg)]';
      textClass = 'text-[var(--color-tag-review-exists-text)]';
      extraClass = 'ring-1 ring-inset ring-[var(--color-tag-review-exists-border)]';
      break;
    case 'draft':
      bgClass = 'bg-yellow-100';
      textClass = 'text-yellow-800';
      break;
    case 'flagged':
      bgClass = 'bg-red-100';
      textClass = 'text-red-800';
      break;
    case 'archived':
      bgClass = 'bg-gray-100';
      textClass = 'text-gray-400';
      break;
    case 'neutral':
    default:
      bgClass = 'bg-[var(--color-tag-neutral-bg)]';
      textClass = 'text-[var(--color-tag-neutral-text)]';
      extraClass = 'ring-1 ring-inset ring-[var(--color-tag-neutral-border)]';
      break;
  }

  const equalSentViaWidth =
    wide || label === 'Manager Form' || label === 'Automated email' || label === 'Admin form'
      ? 'min-w-[7.5rem] justify-center px-3'
      : '';

  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 py-0 text-xs font-semibold leading-none select-none ${equalSentViaWidth} ${bgClass} ${textClass} ${extraClass}`}
      style={{ fontSize: 'var(--font-size-xs)' }}
    >
      {prefix}
      {label}
    </span>
  );
}
