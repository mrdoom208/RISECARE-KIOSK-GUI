import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { SettingsAccount } from "@/components/LoginDialog";

interface ProfileSettingsProps {
  account: SettingsAccount | null;
}

export function ProfileSettings({ account }: ProfileSettingsProps) {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch("/api/settings/me");
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json() as Promise<SettingsAccount>;
    },
  });

  const me = profile ?? account;

  const formatDate = (value: string | undefined) => {
    if (!value) return "—";
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-3xl font-bold">Profile</h2>
        <p className="mt-1 text-muted-foreground">Your account information.</p>
      </div>

      {isLoading ? (
        <div className="rounded-md border border-border/60 bg-card p-5 animate-pulse">
          <div className="flex items-center justify-between gap-3">
            <div className="h-6 w-32 rounded-md bg-muted" />
            <div className="h-5 w-24 rounded-md bg-muted" />
          </div>
          <div className="mt-3 h-4 w-48 rounded-md bg-muted" />
          <div className="mt-3 flex items-center justify-between gap-3 pt-3 border-t border-border/60">
            <div className="h-4 w-36 rounded-md bg-muted" />
            <div className="h-4 w-10 rounded-md bg-muted" />
          </div>
        </div>
      ) : me ? (
        <div className="rounded-md border border-border/60 bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-xl font-semibold">{me.username}</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium shrink-0 ${
                me.role === "superadmin"
                  ? "bg-primary/10 text-primary"
                  : "bg-amber-500/10 text-amber-700"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {me.role === "superadmin" ? "Super Admin" : "Admin"}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Administrator account</p>
            <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              You
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 pt-3 border-t border-border/60">
            <p className="text-sm text-muted-foreground">Member since {formatDate(me.created_at)}</p>
            <span className="text-sm text-muted-foreground">ID {me.id}</span>
          </div>
        </div>
      ) : (
        <p className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          Loading profile...
        </p>
      )}
    </div>
  );
}
