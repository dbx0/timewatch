import type { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm";
}

const variants = {
  primary: "bg-accent text-white font-semibold hover:bg-[#6b9aff]",
  secondary: "bg-raise2 text-text font-medium hover:bg-[#2e2e38]",
  ghost: "bg-transparent text-mute font-medium hover:bg-raise hover:text-text",
};

export function Button({ variant = "secondary", size, className = "", type = "button", ...rest }: Props) {
  const sz = size === "sm" ? "px-2.5 py-1.5 text-[13px] rounded-lg" : "px-3.5 py-[9px] rounded-[10px]";
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap select-none cursor-pointer transition active:scale-[.97] outline-none focus-visible:ring-2 focus-visible:ring-accent2 disabled:opacity-40 disabled:pointer-events-none ${sz} ${variants[variant]} ${className}`}
      {...rest}
    />
  );
}
