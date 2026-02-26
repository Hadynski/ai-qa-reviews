"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { Switch } from "@/components/ui/switch";

export default function StatusesPage() {
  const router = useRouter();
  const { isLoading, isAdmin } = useCurrentUser();
  const [syncing, setSyncing] = useState(false);

  const statuses = useQuery(api.daktelaStatuses.list);
  const questionGroups = useQuery(api.questionGroups.list);
  const setActive = useMutation(api.daktelaStatuses.setActiveForQa);
  const triggerSync = useMutation(api.daktelaStatuses.triggerSync);

  if (!isLoading && !isAdmin) {
    router.push("/");
    return null;
  }

  if (!statuses || !questionGroups) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse h-8 bg-muted rounded w-48" />
      </div>
    );
  }

  function getLinkedGroups(statusId: string) {
    return (questionGroups ?? []).filter((g) =>
      g.statusIds.includes(statusId)
    );
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await triggerSync();
    } finally {
      setTimeout(() => setSyncing(false), 3000);
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Daktela Statuses</h1>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Sync from Daktela"}
        </button>
      </div>

      {statuses.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          No statuses found. Click &quot;Sync from Daktela&quot; to fetch
          available statuses.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Status ID</th>
                <th className="text-left p-3 font-medium">Title</th>
                <th className="text-left p-3 font-medium">
                  Linked Question Groups
                </th>
                <th className="text-left p-3 font-medium">Active for QA</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {statuses.map((status) => {
                const linked = getLinkedGroups(status.statusId);
                return (
                  <tr key={status._id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-mono text-xs">
                      {status.statusId}
                    </td>
                    <td className="p-3">{status.title}</td>
                    <td className="p-3">
                      {linked.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {linked.map((g) => (
                            <span
                              key={g._id}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800"
                            >
                              {g.displayName}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          None
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <Switch
                        checked={status.isActiveForQa}
                        onCheckedChange={(checked) =>
                          setActive({
                            statusId: status.statusId,
                            isActiveForQa: checked,
                          })
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
