import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/class-name.utility";

type ButtonVariant = "default" | "ghost" | "outline" | "subtle";
type ButtonSize = "default" | "sm" | "icon" | "icon-sm";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
};

const variants: Record<ButtonVariant, string> = {
  default: "bg-[var(--accent)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.2)] hover:bg-[var(--accent-strong)]",
  ghost: "text-[var(--foreground)] hover:bg-[var(--surface-hover)]",
  outline: "border border-[var(--line-strong)] bg-white text-[var(--foreground)] hover:bg-[var(--surface-hover)]",
  subtle: "bg-[var(--surface-subtle)] text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
};

const sizes: Record<ButtonSize, string> = {
  default: "h-8 gap-1.5 px-3 text-[12px]",
  sm: "h-7 gap-1 px-2 text-[11px]",
  icon: "size-8 p-0",
  "icon-sm": "size-7 p-0",
};

export function Button({ className, variant = "ghost", size = "default", type = "button", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[3px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
      type={type}
      {...props}
    />
  );
}
