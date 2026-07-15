import DottedScroll from './DottedScroll';
import {
  adminPageShellClass,
  adminPageShellClassNarrow,
} from '../../utils/responsiveLayout';

/**
 * Shared admin page shell with the dotted vertical scroll indicator.
 */
export default function AdminPageScroll({
  children,
  className = '',
  narrow = false,
  contentClassName = 'flex flex-col gap-4 sm:gap-6 select-none pb-2',
  dataPage,
}) {
  return (
    <div
      data-page={dataPage}
      className={`${narrow ? adminPageShellClassNarrow : adminPageShellClass} ${className}`.trim()}
    >
      <DottedScroll className="flex-1 min-h-0" contentClassName={contentClassName}>
        {children}
      </DottedScroll>
    </div>
  );
}
