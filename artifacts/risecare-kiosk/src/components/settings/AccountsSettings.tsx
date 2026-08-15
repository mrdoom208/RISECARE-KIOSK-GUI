import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  KeyRound,
  Loader2,
  MoreVertical,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import type { SettingsAccount } from "@/components/LoginDialog";

interface AccountsSettingsProps {
  account: SettingsAccount | null;
  isRateLimited: (key: string) => boolean;
  onCreateAccount: () => void;
  onEditAccount: (acc: SettingsAccount) => void;
}

type RoleFilter = "all" | "admin" | "superadmin";

export function AccountsSettings({
  account,
  isRateLimited,
  onCreateAccount,
  onEditAccount,
}: AccountsSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmRemove, setConfirmRemove] = useState<SettingsAccount | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (menuOpenId === null) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [menuOpenId]);

  const { data: adminAccounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const res = await fetch("/api/settings/accounts");
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return res.json() as Promise<SettingsAccount[]>;
    },
  });

  const removeAccountMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/settings/accounts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        let msg = "Failed to remove account";
        try {
          const err = await res.json();
          msg = err.error || err.message || msg;
        } catch {
          msg = `Server error (${res.status})`;
        }
        throw new Error(msg);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Account removed", description: "Account deleted" });
      setConfirmRemove(null);
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to remove account",
        description: err.message,
        variant: "destructive",
      });
      setConfirmRemove(null);
    },
  });

  const showSearch = (adminAccounts?.length ?? 0) >= 5;

  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (adminAccounts ?? []).filter((acc) => {
      const matchesSearch = !query || acc.username.toLowerCase().includes(query);
      const matchesRole = roleFilter === "all" || acc.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [adminAccounts, search, roleFilter]);

  const openActions = (acc: SettingsAccount) => {
    if (isRateLimited("edit-account-" + acc.id)) return;
    setMenuOpenId((cur) => (cur === acc.id ? null : acc.id));
  };

  const requestRemove = (acc: SettingsAccount) => {
    if (isRateLimited("remove-account-" + acc.id)) return;
    setMenuOpenId(null);
    setConfirmRemove(acc);
  };

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
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-3xl font-bold">Accounts</h2>
          <span className="shrink-0 rounded-md bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
            {(adminAccounts?.length ?? 0)}{" "}
            {(adminAccounts?.length ?? 0) === 1 ? "account" : "accounts"}
          </span>
        </div>
        <p className="mt-1 text-muted-foreground">
          Manage administrators who can access this application.
        </p>
        <button
          onClick={() => {
            if (isRateLimited("create-admin")) return;
            onCreateAccount();
          }}
          className="mt-4 w-full flex items-center justify-center gap-2 h-14 rounded-md bg-primary text-primary-foreground text-xl font-semibold shadow-sm hover:bg-primary/90"
        >
          <UserPlus className="w-6 h-6" />
          Create account
        </button>
      </div>

      {showSearch && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search accounts..."
              className="w-full h-12 pl-11 pr-4 rounded-md bg-background border-2 border-border outline-none text-lg"
            />
          </div>
          <div className="flex gap-2">
            {(
              [
                ["all", "All"],
                ["admin", "Admins"],
                ["superadmin", "Super Admins"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setRoleFilter(value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                  roleFilter === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {accountsLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-md border border-border/60 bg-card p-5 animate-pulse">
              <div className="flex items-center justify-between gap-3">
                <div className="h-6 w-32 rounded-md bg-muted" />
                <div className="h-5 w-24 rounded-md bg-muted" />
              </div>
              <div className="mt-3 h-4 w-48 rounded-md bg-muted" />
              <div className="mt-3 flex items-center justify-between gap-3 pt-3 border-t border-border/60">
                <div className="h-4 w-36 rounded-md bg-muted" />
                <div className="h-8 w-20 rounded-md bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredAccounts.length === 0 ? (
        adminAccounts && adminAccounts.length > 0 ? (
          <p className="text-center text-muted-foreground py-8 text-lg">
            No accounts match your search.
          </p>
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="text-5xl">👤</span>
            <p className="text-xl font-semibold">No accounts yet</p>
            <p className="text-muted-foreground">
              Create an administrator account to get started.
            </p>
            <button
              onClick={() => {
                if (isRateLimited("create-admin")) return;
                onCreateAccount();
              }}
              className="mt-3 flex items-center gap-2 px-6 h-12 rounded-md bg-primary text-primary-foreground text-lg font-semibold"
            >
              <UserPlus className="w-5 h-5" />
              Create account
            </button>
          </div>
        )
      ) : (
        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {filteredAccounts.map((acc) => {
            const isSelf = account?.id === acc.id;
            const isProtected = !isSelf && acc.role === "superadmin";
            return (
              <div key={acc.id} className="rounded-md border border-border/60 bg-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-xl font-semibold">{acc.username}</span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium shrink-0 ${
                      acc.role === "superadmin"
                        ? "bg-primary/10 text-primary"
                        : "bg-amber-500/10 text-amber-700"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {acc.role === "superadmin" ? "Super Admin" : "Admin"}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">Administrator account</p>
                  {isSelf && (
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      You
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 pt-3 border-t border-border/60">
                  <p className="text-sm text-muted-foreground">
                    Created {formatDate(acc.created_at)}
                  </p>
                  {isProtected ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground shrink-0">
                      <ShieldCheck className="w-4 h-4" />
                      Protected
                    </span>
                  ) : (
                    <div className="relative" ref={menuOpenId === acc.id ? menuRef : null}>
                        <button
                          onClick={() => openActions(acc)}
                          className="p-1.5 rounded-md hover:bg-muted"
                          aria-label="Account actions"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        {menuOpenId === acc.id && (
                          <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-border bg-popover shadow-lg p-1.5">
                              <button
                                onClick={() => {
                                  if (isRateLimited("edit-account-" + acc.id)) return;
                                  setMenuOpenId(null);
                                  onEditAccount(acc);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-muted"
                              >
                                <Pencil className="w-4 h-4" />
                                Edit account
                              </button>
                              <button
                                onClick={() => {
                                  if (isRateLimited("edit-account-" + acc.id)) return;
                                  setMenuOpenId(null);
                                  onEditAccount(acc);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-muted"
                              >
                                <KeyRound className="w-4 h-4" />
                                Reset password
                              </button>
                              {!isSelf && (
                                <>
                                  <div className="my-1 h-px bg-border" />
                                  <button
                                    onClick={() => requestRemove(acc)}
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-destructive hover:bg-destructive/10"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    Remove account
                                  </button>
                                </>
                              )}
                            </div>
                        )}
                      </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmRemove && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm">
          <div className="rounded-md bg-card shadow-2xl p-8 w-full max-w-md border border-border/50">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold">Remove account?</h2>
              <button
                onClick={() => setConfirmRemove(null)}
                className="p-2 rounded-md hover:bg-muted"
                aria-label="Close"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="text-lg">
              Are you sure you want to remove{" "}
              <span className="font-semibold">&quot;{confirmRemove.username}&quot;</span>?
            </p>
            <p className="mt-2 text-muted-foreground">
              This account will no longer be able to sign in.
            </p>
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setConfirmRemove(null)}
                className="flex-1 h-14 rounded-md bg-secondary text-lg font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => removeAccountMutation.mutate(confirmRemove.id)}
                disabled={removeAccountMutation.isPending}
                className="flex-1 h-14 rounded-md bg-destructive text-white text-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {removeAccountMutation.isPending ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  "Remove account"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
