import React, { memo, useEffect, useRef } from 'react';
import { gsap } from 'gsap';

type StandardTemplatePillOptionProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  active?: boolean;
};

const canAnimateTemplatePill = () => (
  typeof window !== 'undefined' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const StandardTemplatePillOption: React.FC<StandardTemplatePillOptionProps> = memo(({
  active = false,
  className = '',
  children,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  ...props
}) => {
  const pillRef = useRef<HTMLLabelElement | null>(null);
  const fillRef = useRef<HTMLSpanElement | null>(null);
  const motionEnabledRef = useRef(false);

  const layoutFill = () => {
    const pill = pillRef.current;
    const fill = fillRef.current;
    if (!pill || !fill) return;

    const { width, height } = pill.getBoundingClientRect();
    const radius = ((width * width) / 4 + height * height) / (2 * height);
    const diameter = Math.ceil(2 * radius) + 8;
    const delta = Math.ceil(radius - Math.sqrt(Math.max(0, radius * radius - (width * width) / 4))) + 4;
    const originY = diameter - delta;

    fill.style.width = `${diameter}px`;
    fill.style.height = `${diameter}px`;
    fill.style.bottom = `-${delta}px`;

    gsap.set(fill, {
      xPercent: -50,
      scale: active ? 0.28 : 0,
      transformOrigin: `50% ${originY}px`,
    });
  };

  useEffect(() => {
    motionEnabledRef.current = canAnimateTemplatePill();
    layoutFill();

    const reducedMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => {
      motionEnabledRef.current = canAnimateTemplatePill();
      layoutFill();
    };

    reducedMedia.addEventListener('change', updateMotion);
    window.addEventListener('resize', layoutFill);

    return () => {
      reducedMedia.removeEventListener('change', updateMotion);
      window.removeEventListener('resize', layoutFill);
    };
  }, [active]);

  const handlePointerEnter: React.PointerEventHandler<HTMLLabelElement> = (event) => {
    onPointerEnter?.(event);
    layoutFill();

    const fill = fillRef.current;
    if (!fill || !motionEnabledRef.current) return;

    gsap.to(fill, {
      scale: 1.08,
      duration: 0.36,
      ease: 'power3.out',
      overwrite: 'auto',
    });

    const pill = pillRef.current;
    if (pill) {
      gsap.to(pill, {
        y: -1,
        scale: 1.008,
        duration: 0.28,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    }
  };

  const handlePointerMove: React.PointerEventHandler<HTMLLabelElement> = (event) => {
    onPointerMove?.(event);

    const pill = pillRef.current;
    if (!pill) return;

    const rect = pill.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    pill.style.setProperty('--standard-pill-x', `${localX}px`);
    pill.style.setProperty('--standard-pill-y', `${localY}px`);

    const fill = fillRef.current;
    if (fill && motionEnabledRef.current) {
      gsap.to(fill, {
        scale: 1.08,
        duration: 0.26,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    }
  };

  const handlePointerLeave: React.PointerEventHandler<HTMLLabelElement> = (event) => {
    onPointerLeave?.(event);

    const fill = fillRef.current;
    if (fill && motionEnabledRef.current) {
      gsap.to(fill, {
        scale: active ? 0.28 : 0,
        duration: 0.24,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    }

    const pill = pillRef.current;
    if (pill && motionEnabledRef.current) {
      gsap.to(pill, {
        y: 0,
        scale: 1,
        duration: 0.3,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    }
  };

  return (
    <label
      {...props}
      ref={pillRef}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`standard-template-pill ${active ? 'standard-template-pill--active' : ''} ${className}`}
    >
      <span ref={fillRef} className="standard-template-pill__fill" aria-hidden="true" />
      <span className="standard-template-pill__shine" aria-hidden="true" />
      {children}
    </label>
  );
});

StandardTemplatePillOption.displayName = 'StandardTemplatePillOption';

export default StandardTemplatePillOption;
