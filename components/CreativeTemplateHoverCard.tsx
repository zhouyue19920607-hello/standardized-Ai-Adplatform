import React, { memo, useEffect, useRef } from 'react';
import { gsap } from 'gsap';

type CreativeTemplateHoverCardProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    active?: boolean;
    glowColor?: string;
};

const canRunMotion = () => (
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const CreativeTemplateHoverCard: React.FC<CreativeTemplateHoverCardProps> = memo(({
    active = false,
    glowColor = '99, 102, 241',
    className = '',
    children,
    onClick,
    onPointerEnter,
    onPointerLeave,
    onPointerMove,
    onMouseEnter,
    onMouseLeave,
    style,
    ...props
}) => {
    const cardRef = useRef<HTMLButtonElement | null>(null);
    const motionEnabledRef = useRef(false);

    useEffect(() => {
        motionEnabledRef.current = canRunMotion();

        const hoverMedia = window.matchMedia('(hover: hover) and (pointer: fine)');
        const reducedMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
        const updateMotion = () => {
            motionEnabledRef.current = canRunMotion();
        };

        hoverMedia.addEventListener('change', updateMotion);
        reducedMedia.addEventListener('change', updateMotion);

        return () => {
            hoverMedia.removeEventListener('change', updateMotion);
            reducedMedia.removeEventListener('change', updateMotion);
        };
    }, []);

    const resetCard = () => {
        const card = cardRef.current;
        if (!card || !motionEnabledRef.current) return;

        gsap.to(card, {
            x: 0,
            y: 0,
            rotationX: 0,
            rotationY: 0,
            scale: 1,
            duration: 0.55,
            ease: 'elastic.out(1, 0.62)',
        });
    };

    const handlePointerMove: React.PointerEventHandler<HTMLButtonElement> = (event) => {
        onPointerMove?.(event);

        const card = cardRef.current;
        if (!card) return;

        const rect = card.getBoundingClientRect();
        const localX = event.clientX - rect.left;
        const localY = event.clientY - rect.top;
        const xRatio = (localX / rect.width - 0.5) * 2;
        const yRatio = (localY / rect.height - 0.5) * 2;

        card.style.setProperty('--template-card-x', `${localX}px`);
        card.style.setProperty('--template-card-y', `${localY}px`);

        if (!motionEnabledRef.current) return;

        gsap.to(card, {
            x: xRatio * 3,
            y: yRatio * 2,
            rotationX: -yRatio * 3.5,
            rotationY: xRatio * 4.5,
            scale: active ? 1.015 : 1.012,
            transformPerspective: 720,
            transformOrigin: 'center',
            duration: 0.42,
            ease: 'power3.out',
        });
    };

    const handlePointerEnter: React.PointerEventHandler<HTMLButtonElement> = (event) => {
        onPointerEnter?.(event);

        const card = cardRef.current;
        if (!card || !motionEnabledRef.current) return;

        gsap.to(card, {
            scale: active ? 1.015 : 1.01,
            duration: 0.35,
            ease: 'power3.out',
        });
    };

    const handlePointerLeave: React.PointerEventHandler<HTMLButtonElement> = (event) => {
        onPointerLeave?.(event);
        const card = cardRef.current;
        if (card) {
            card.style.setProperty('--template-card-x', '50%');
            card.style.setProperty('--template-card-y', '50%');
        }
        resetCard();
    };

    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
        const card = cardRef.current;
        if (card) {
            const rect = card.getBoundingClientRect();
            card.style.setProperty('--template-card-click-x', `${event.clientX - rect.left}px`);
            card.style.setProperty('--template-card-click-y', `${event.clientY - rect.top}px`);
            card.classList.remove('creative-template-card--clicked');
            void card.offsetWidth;
            card.classList.add('creative-template-card--clicked');
            window.setTimeout(() => card.classList.remove('creative-template-card--clicked'), 520);
        }

        onClick?.(event);
    };

    return (
        <button
            {...props}
            ref={cardRef}
            type={props.type ?? 'button'}
            onClick={handleClick}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
            onPointerMove={handlePointerMove}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            className={`creative-template-card ${active ? 'creative-template-card--active' : ''} ${className}`}
            style={{
                ...style,
                '--template-glow-rgb': glowColor,
            } as React.CSSProperties}
        >
            <span className="creative-template-card__effect creative-template-card__spotlight" />
            <span className="creative-template-card__effect creative-template-card__ripple" />
            <span className="creative-template-card__effect creative-template-card__stars" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
            </span>
            {children}
        </button>
    );
});

CreativeTemplateHoverCard.displayName = 'CreativeTemplateHoverCard';

export default CreativeTemplateHoverCard;
