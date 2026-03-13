import { ReactNode } from "react";
import { VitalStatus, getStatusColor, getStatusText } from "@/lib/vitals-utils";
import { Plus } from "lucide-react";

interface VitalCardProps {
  title: string;
  value?: string | number | null;
  secondaryValue?: string | number | null; // For Diastolic
  unit: string;
  icon: ReactNode;
  status: VitalStatus;
  onClick: () => void;
  isDouble?: boolean;
}

export function VitalCard({
  title,
  value,
  secondaryValue,
  unit,
  icon,
  status,
  onClick,
  isDouble,
}: VitalCardProps) {
  const hasValue = value !== undefined && value !== null && value !== "";

  return (
    <div
      onClick={onClick}
      className={`
        relative overflow-hidden group cursor-pointer
        bg-card rounded-xl p-3 border-2 
        transition-all duration-200 active:scale-[0.98]
        shadow-sm hover:shadow-md
        ${hasValue ? "border-border/50" : "border-dashed border-border hover:border-primary/50"}
      `}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`p-2 rounded-xl ${
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
          <h3 className="text-xl font-bold text-foreground">{title}</h3>
        </div>

        {hasValue && (
          <div
            className={`px-2 py-1 rounded-full text-xs font-bold tracking-wide uppercase ${getStatusColor(
              status,
            )}`}
          >
            {getStatusText(status)}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        {hasValue ? (
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-display font-bold text-foreground tracking-tight">
              {value}
            </span>
            {isDouble && secondaryValue && (
              <>
                <span className="text-2xl text-muted-foreground font-light">
                  /
                </span>
                <span className="text-3xl font-display font-bold text-foreground tracking-tight">
                  {secondaryValue}
                </span>
              </>
            )}
            <span className="text-xl font-medium text-muted-foreground ml-1">
              {unit}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xl font-medium text-muted-foreground/60 py-1">
            <Plus className="w-4 h-4" />
            <span>Tap to record</span>
          </div>
        )}
      </div>

      {/* Decorative background element */}
      <div className="absolute -bottom-3 -right-3 opacity-[0.03] pointer-events-none transform scale-150">
        {icon}
      </div>
    </div>
  );
}
