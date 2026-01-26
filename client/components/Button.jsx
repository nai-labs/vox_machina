export default function Button({ icon, children, onClick, className, variant = 'primary', disabled = false }) {
  const variantStyles = {
    primary: 'text-neon-primary border-neon-primary',
    secondary: 'text-neon-secondary border-neon-secondary',
    tertiary: 'text-neon-tertiary border-neon-tertiary',
    danger: 'text-red-400 border-red-400'
  };

  return (
    <button
      className={`terminal-button flex items-center gap-2 ${variantStyles[variant]} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {children}
    </button>
  );
}
