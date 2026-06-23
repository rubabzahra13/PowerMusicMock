export default function Tag({ variant, label }) {
  let bgClass = '';
  let textClass = '';
  let prefix = '';

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
      bgClass = 'bg-[var(--color-tag-already-exists-bg)]';
      textClass = 'text-[var(--color-tag-already-exists-text)]';
      prefix = '⚠ ';
      break;
    case 'add-action':
      bgClass = 'bg-[var(--color-tag-add-action-bg)]';
      textClass = 'text-[var(--color-tag-add-action-text)]';
      break;
    case 'remove-action':
      bgClass = 'bg-[var(--color-tag-remove-action-bg)]';
      textClass = 'text-[var(--color-tag-remove-action-text)]';
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
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold select-none ${bgClass} ${textClass}`}
      style={{ fontSize: 'var(--font-size-xs)' }}
    >
      {prefix}
      {label}
    </span>
  );
}
