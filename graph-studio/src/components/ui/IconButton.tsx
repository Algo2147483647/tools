import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  icon: ReactNode;
  ariaControls?: string;
  ariaExpanded?: boolean;
  variant?: "toolbar" | "quiet";
}

export default function IconButton({
  label,
  icon,
  ariaControls,
  ariaExpanded,
  variant = "toolbar",
  className = "",
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      className={`icon-button ${variant === "toolbar" ? "ghost-btn icon-button--toolbar" : "icon-button--quiet"} ${className}`}
      type={type}
      title={label}
      aria-label={label}
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
    >
      <span className="icon-button-content" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}
