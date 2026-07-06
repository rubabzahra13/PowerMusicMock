export default function Tag({ variant, label, compact = false, prefix: prefixOverride }) {
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
    default:
      bgClass = 'bg-gray-100';
      textClass = 'text-gray-800';
      break;
  }

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold select-none ${compact ? 'px-1.5 py-0.5 text-[10px] leading-tight' : 'px-2 py-0.5 text-xs'} ${bgClass} ${textClass} ${extraClass}`}
      style={compact ? undefined : { fontSize: 'var(--font-size-xs)' }}
    >
      {prefix}
      {label}
    </span>
  );
}
