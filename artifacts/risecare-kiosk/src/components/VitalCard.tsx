import { ReactNode } from "react";
import { VitalStatus, getStatusColor, getStatusText } from "@/lib/vitals-utils";
import { Plus, Lock } from "lucide-react";

interface VitalCardProps {
  title: string;
  value?: string | number | null;
  secondaryValue?: string | number | null; // For Diastolic
  doubleValueLabels?: [string, string];
  asideValue?: string | number | null;
  asideLabel?: string;
  asideUnit?: string;
  detail?: string;
  unit: string;
  icon: ReactNode;
  status: VitalStatus;
  onClick: () => void;
  isDouble?: boolean;
  disabled?: boolean;
}

export function VitalCard({
  title,
  value,
  secondaryValue,
  doubleValueLabels,
  asideValue,
  asideLabel,
  asideUnit,
  detail,
  unit,
  icon,
  status,
  onClick,
  isDouble,
  disabled = false,
}: VitalCardProps) {
  const hasValue = value !== undefined && value !== null && value !== "";

  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={`
        relative overflow-hidden group
        bg-card rounded-xl p-5 border-2 
        ${disabled 
          ? "cursor-not-allowed opacity-50 border-border/30" 
          : "cursor-pointer shadow-sm border-border/50 hover:border-primary/50 active:scale-[0.97] transition-transform duration-100"
        }
        ${hasValue && !disabled ? "" : "border-dashed"}
      `}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-3 rounded-xl ${
              hasValue
                ? getStatusColor(status)
                    .replace("text-", "bg-opacity-20 text-")
                    .replace("bg-", "bg-")
                    .split(" ")[0] + "/20"
                : "bg-secondary"
            } text-primary`}
          >
            {icon}
          </div>
          <h3 className="text-2xl font-bold text-foreground">{title}</h3>
        </div>

        {!hasValue && !disabled && (
           <div className="flex items-center gap-1.5 text-base text-muted-foreground/60 py-1">
             <Plus className="w-4 h-4" />
             <span>Tap to record</span>
           </div>
         )}
         {disabled && (
           <div className="flex items-center gap-1.5 text-base text-muted-foreground/60 py-1">
             <Lock className="w-4 h-4" />
             <span>Disabled</span>
           </div>
         )}
      </div>

      <div className={`mt-3 flex ${asideLabel ? "items-stretch justify-start gap-4" : "items-baseline justify-between"}`}>
        {hasValue ? (
          <div className="flex items-center gap-1.5">
            <div className="flex flex-col">
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-display font-bold text-foreground tracking-tight">
                  {value}
                </span>
                {isDouble && secondaryValue != null && (
                  <>
                    <span className="text-3xl text-muted-foreground font-light">/</span>
                    <span className="text-4xl font-display font-bold text-foreground tracking-tight">
                      {secondaryValue}
                    </span>
                  </>
                )}
                <span className="text-2xl font-medium text-muted-foreground ml-1">
                  {unit}
                </span>
              </div>
              {isDouble && doubleValueLabels && secondaryValue != null && (
                <div className="mt-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>{doubleValueLabels[0]}</span>
                  <span aria-hidden="true">/</span>
                  <span>{doubleValueLabels[1]}</span>
                </div>
              )}
            </div>
            {asideLabel && (
              <>
                <span aria-hidden="true" className="mx-1 self-stretch border-l border-border" />
                <div className="flex flex-col justify-center">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-display font-bold text-foreground tracking-tight">
                      {asideValue ?? "—"}
                    </span>
                    {asideUnit && (
                      <span className="text-lg font-medium text-muted-foreground">{asideUnit}</span>
                    )}
                  </div>
                  <span className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {asideLabel}
                  </span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-2xl font-medium text-muted-foreground/60 py-1">
            <Plus className="w-6 h-6" />
            <span>Tap to record</span>
          </div>
        )}
      </div>

      {detail && <p className="mt-2 text-sm text-muted-foreground">{detail}</p>}

      {/* Decorative background element */}
      <div className="absolute -bottom-3 -right-3 opacity-[0.03] pointer-events-none transform scale-150">
        {icon}
      </div>
    </div>
  );
}
