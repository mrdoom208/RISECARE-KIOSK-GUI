import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface SettingsMenuItemProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  ariaLabel?: string;
  destructive?: boolean;
  trailing?: ReactNode;
}

export function SettingsMenuItem({
  icon: Icon,
  label,
  onClick,
  ariaLabel,
  destructive,
  trailing,
}: SettingsMenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`w-full flex items-center justify-between gap-3 p-5 rounded-xl ${
        destructive
          ? "bg-destructive/10 hover:bg-destructive/20 text-destructive"
          : "bg-secondary hover:bg-secondary/80"
      }`}
    >
      <span className="flex items-center gap-3 min-w-0">
        <Icon
          className={`w-6 h-6 shrink-0 ${destructive ? "text-destructive" : ""}`}
        />
        <span className="text-xl font-semibold truncate">{label}</span>
      </span>
      <span className="flex items-center gap-2 shrink-0">
        {trailing}
        <ChevronRight className="w-6 h-6" />
      </span>
    </button>
  );
}
