import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive';

/** For a link that has to look like a button. The look itself is `.hc-btn` in index.css. */
export const buttonClass = (variant: ButtonVariant = 'primary', className?: string): string =>
  ['hc-btn', `hc-btn-${variant}`, className].filter(Boolean).join(' ');

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/** The one button. A form's submit has to ask for `type="submit"`. */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', type = 'button', className, ...props }, ref) => (
    <button ref={ref} type={type} className={buttonClass(variant, className)} {...props} />
  ),
);
Button.displayName = 'Button';

export default Button;
