'use client';

import { useEffect, useId, useRef, useState } from 'react';

type InfoHintPlacement = 'start' | 'end' | 'below';

export function InfoHint({ label, children, placement = 'below' }: { label: string; children: React.ReactNode; placement?: InfoHintPlacement }) {
  const contentId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const accessibleLabel = label.endsWith('说明') ? label : `${label}说明`;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return <span ref={rootRef} className={`info-hint info-hint-${placement}`}>
    <button type="button" className="info-hint-trigger" aria-label={accessibleLabel} aria-controls={contentId} aria-expanded={open} onClick={() => setOpen((value) => !value)}>ⓘ</button>
    {open && <span id={contentId} className="info-hint-content" role="tooltip">{children}</span>}
  </span>;
}

export function TextDisclosure({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <details className={`text-disclosure ${className}`.trim()}>
    <summary>{label}</summary>
    <div>{children}</div>
  </details>;
}
