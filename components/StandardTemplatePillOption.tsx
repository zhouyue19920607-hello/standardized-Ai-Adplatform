import React, { memo } from 'react';

type StandardTemplatePillOptionProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  active?: boolean;
};

const StandardTemplatePillOption: React.FC<StandardTemplatePillOptionProps> = memo(({
  active = false,
  className = '',
  children,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  ...props
}) => {
  const handlePointerEnter: React.PointerEventHandler<HTMLLabelElement> = (event) => {
    onPointerEnter?.(event);
  };

  const handlePointerMove: React.PointerEventHandler<HTMLLabelElement> = (event) => {
    onPointerMove?.(event);
  };

  const handlePointerLeave: React.PointerEventHandler<HTMLLabelElement> = (event) => {
    onPointerLeave?.(event);
  };

  return (
    <label
      {...props}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`standard-template-pill ${active ? 'standard-template-pill--active' : ''} ${className}`}
    >
      {children}
    </label>
  );
});

StandardTemplatePillOption.displayName = 'StandardTemplatePillOption';

export default StandardTemplatePillOption;
