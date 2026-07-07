import { useCallback, useEffect, useRef, useState } from 'react';

const DOT_COUNT = 3;

const DEFAULT_SCROLL_CLASS = 'h-full overflow-y-scroll scrollbar-hide pr-5';

export default function DottedScroll({
  children,
  className = '',
  contentClassName = 'flex flex-col gap-4',
  scrollClassName = DEFAULT_SCROLL_CLASS,
}) {
  const containerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [canScroll, setCanScroll] = useState(false);
  const bounded = !scrollClassName.includes('h-full');

  const updateScrollState = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    const maxScroll = scrollHeight - clientHeight;
    const scrollable = maxScroll > 4;

    setCanScroll(scrollable);

    if (!scrollable) {
      setActiveIndex(0);
      return;
    }

    const progress = scrollTop / maxScroll;
    setActiveIndex(Math.round(progress * (DOT_COUNT - 1)));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    updateScrollState();

    el.addEventListener('scroll', updateScrollState, { passive: true });
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      resizeObserver.disconnect();
    };
  }, [updateScrollState]);

  return (
    <div className={`relative ${bounded ? 'shrink-0 w-full' : 'flex-1 min-h-0'} ${className}`}>
      <div
        ref={containerRef}
        className={scrollClassName}
      >
        <div className={contentClassName}>
          {children}
        </div>
      </div>

      {canScroll && (
        <div
          className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 py-3 pointer-events-none"
          aria-hidden="true"
        >
          {Array.from({ length: DOT_COUNT }).map((_, index) => (
            <span
              key={index}
              className={`rounded-full transition-all duration-150 ${
                index === activeIndex
                  ? 'w-2 h-2 bg-[var(--color-brand-primary)]'
                  : 'w-1.5 h-1.5 bg-[var(--color-border-default)]'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
