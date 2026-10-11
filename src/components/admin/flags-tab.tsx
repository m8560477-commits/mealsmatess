import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  adminDeleteFeatureFlag,
  adminUpsertFeatureFlag,
  listFeatureFlags,
} from "@/lib/feature-flags.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export function FlagsTab() {
  const qc = useQueryClient();
  const { data: flags, isLoading } = useQuery({
    queryKey: ["feature-flags-admin"],
    queryFn: () => listFeatureFlags(),
  });

  const upsert = useMutation({
    mutationFn: (v: { key: string; enabled: boolean; description?: string; rollout_percent: number }) =>
      adminUpsertFeatureFlag({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feature-flags-admin"] });
      qc.invalidateQueries({ queryKey: ["feature-flags"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const del = useMutation({
    mutationFn: (key: string) => adminDeleteFeatureFlag({ data: { key } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feature-flags-admin"] }),
  });

  const [newKey, setNewKey] = useState("");
  const [newDesc, setNewDesc] = useState("");

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="font-medium">New flag</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-[220px_1fr_auto]">
          <Input placeholder="flag_key" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
          <Input placeholder="Description" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          <Button
            disabled={!newKey || upsert.isPending}
            onClick={() => {
              upsert.mutate(
                {
                  key: newKey.trim(),
                  enabled: false,
                  rollout_percent: 100,
                  ...(newDesc.trim() ? { description: newDesc.trim() } : {}),
                },
                {
                  onSuccess: () => {
                    setNewKey("");
                    setNewDesc("");
                    toast.success("Flag created");
                  },
                },
              );
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {(flags ?? []).map((f) => (
          <div key={f.key} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="min-w-0">
              <div className="font-mono text-sm">{f.key}</div>
              {f.description && <div className="text-xs text-muted-foreground">{f.description}</div>}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={!!f.enabled}
                  onCheckedChange={(v) =>
                    upsert.mutate({
                      key: f.key,
                      enabled: v,
                      rollout_percent: f.rollout_percent ?? 100,
                      ...(f.description ? { description: f.description } : {}),
                    })
                  }
                />
                {f.enabled ? "On" : "Off"}
              </label>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => del.mutate(f.key)}
                aria-label="Delete flag"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
