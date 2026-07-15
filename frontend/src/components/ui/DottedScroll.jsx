import { useCallback, useEffect, useRef, useState } from 'react';

const DOT_COUNT = 3;

const DEFAULT_SCROLL_CLASS = {
  // No right padding — dots overlay so the scroll viewport can fill main.
  vertical: 'h-full overflow-y-scroll scrollbar-hide',
  horizontal: 'w-full overflow-x-scroll scrollbar-hide',
};

/**
 * @param {'overlay' | 'below'} indicatorPlacement
 * - overlay: dots sit on top of the scroll content (vertical default)
 * - below: dots sit under the scroll content (avoids covering table cells)
 */
export default function DottedScroll({
  children,
  className = '',
  contentClassName,
  scrollClassName,
  orientation = 'vertical',
  indicatorPlacement,
}) {
  const containerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [canScroll, setCanScroll] = useState(false);
  const isHorizontal = orientation === 'horizontal';
  const resolvedScrollClass =
    scrollClassName ?? DEFAULT_SCROLL_CLASS[isHorizontal ? 'horizontal' : 'vertical'];
  const resolvedContentClass =
    contentClassName
    ?? (isHorizontal ? 'block w-max min-w-full leading-[0]' : 'flex flex-col gap-4');
  const resolvedIndicatorPlacement =
    indicatorPlacement ?? (isHorizontal ? 'below' : 'overlay');
  const indicatorsBelow = resolvedIndicatorPlacement === 'below';
  const bounded = isHorizontal
    ? !resolvedScrollClass.includes('w-full')
    : !resolvedScrollClass.includes('h-full');

  const updateScrollState = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    if (isHorizontal) {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      const maxScroll = scrollWidth - clientWidth;
      const scrollable = maxScroll > 4;
      setCanScroll(scrollable);
      if (!scrollable) {
        setActiveIndex(0);
        return;
      }
      const progress = scrollLeft / maxScroll;
      setActiveIndex(Math.round(progress * (DOT_COUNT - 1)));
      return;
    }

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
  }, [isHorizontal]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    updateScrollState();

    el.addEventListener('scroll', updateScrollState, { passive: true });
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);
    if (el.firstElementChild) {
      resizeObserver.observe(el.firstElementChild);
    }

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      resizeObserver.disconnect();
    };
  }, [updateScrollState]);

  const dots = canScroll ? (
    <div
      className={
        indicatorsBelow
          ? 'pointer-events-none mt-2 flex items-center justify-center gap-2'
          : isHorizontal
            ? 'pointer-events-none absolute bottom-1.5 left-1/2 z-[2] flex -translate-x-1/2 items-center gap-2'
            : 'pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2 py-3'
      }
      aria-hidden="true"
    >
      {Array.from({ length: DOT_COUNT }).map((_, index) => (
        <span
          key={index}
          className={`rounded-full transition-all duration-150 ${
            index === activeIndex
              ? 'h-2 w-2 bg-[var(--color-brand-primary)]'
              : 'h-1.5 w-1.5 bg-[var(--color-border-default)]'
          }`}
        />
      ))}
    </div>
  ) : null;

  return (
    <div
      className={`relative ${
        bounded
          ? 'shrink-0 w-full'
          : isHorizontal
            ? 'min-w-0 w-full'
            : 'flex-1 min-h-0'
      } ${className}`}
    >
      <div ref={containerRef} className={resolvedScrollClass}>
        <div className={resolvedContentClass}>{children}</div>
      </div>
      {dots}
    </div>
  );
}
