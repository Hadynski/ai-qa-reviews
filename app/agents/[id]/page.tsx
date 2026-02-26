"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "-";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

export default function AgentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const agentId = id as Id<"agents">;

  const agent = useQuery(api.agents.get, { id: agentId });
  const calls = useQuery(api.calls.listByAgent, { agentId, limit: 50 });
  const stats = useQuery(api.stats.getAgentOverview, { agentId });

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const selectedGroup = stats?.groups.find((g) => g._id === selectedGroupId);

  if (agent === undefined) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-muted rounded w-32" />
          <div className="h-8 bg-muted rounded w-64" />
          <div className="h-48 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (agent === null) {
    return (
      <div className="container mx-auto p-6 space-y-4">
        <Link
          href="/agents"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back to Agents
        </Link>
        <p className="text-muted-foreground">Agent not found.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6 animate-fade-in-up">
      <Link
        href="/agents"
        className="inline-block text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        &larr; Back to Agents
      </Link>

      <h1 className="text-2xl font-bold">{agent.displayName}</h1>

      {stats && stats.analyzedCount > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Analyzed Calls
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tabular-nums font-mono">
                {stats.analyzedCount}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Average QA Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={cn(
                  "text-3xl font-bold tabular-nums font-mono",
                  stats.averageScore > 80
                    ? "text-green-600"
                    : stats.averageScore > 50
                      ? "text-yellow-600"
                      : "text-red-600"
                )}
              >
                {stats.averageScore}%
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {stats && stats.groups.length >= 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Per Group</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {stats.groups.map((g) => (
                  <button
                    key={g._id}
                    type="button"
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm transition-colors",
                      g._id === selectedGroupId
                        ? "bg-primary text-primary-foreground"
                        : "bg-background hover:bg-muted"
                    )}
                    onClick={() =>
                      setSelectedGroupId(
                        g._id === selectedGroupId ? null : g._id
                      )
                    }
                  >
                    {g.groupName}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {selectedGroup && selectedGroup.analyzedCount > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Analyzed &mdash; {selectedGroup.groupName}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold tabular-nums font-mono">
                    {selectedGroup.analyzedCount}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Avg Score &mdash; {selectedGroup.groupName}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const avg = Math.round(
                      selectedGroup.totalScore / selectedGroup.analyzedCount
                    );
                    return (
                      <p
                        className={cn(
                          "text-3xl font-bold tabular-nums font-mono",
                          avg > 80
                            ? "text-green-600"
                            : avg > 50
                              ? "text-yellow-600"
                              : "text-red-600"
                        )}
                      >
                        {avg}%
                      </p>
                    );
                  })()}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Avg Duration &mdash; {selectedGroup.groupName}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold tabular-nums font-mono">
                    {formatDuration(
                      selectedGroup.totalDuration / selectedGroup.analyzedCount
                    )}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Recent Calls</h2>
        {!calls ? (
          <div className="h-48 bg-muted rounded animate-pulse" />
        ) : calls.length === 0 ? (
          <p className="text-sm text-muted-foreground">No calls found.</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Call Time</th>
                  <th className="text-left p-3 font-medium">Group</th>
                  <th className="text-left p-3 font-medium">Duration</th>
                  <th className="text-right p-3 font-medium">QA Score</th>
                  <th className="text-left p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {calls.map((call) => (
                  <tr key={call._id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 text-xs">
                      <Link
                        href={`/calls/${call._id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {new Date(call.callTime).toLocaleString()}
                      </Link>
                    </td>
                    <td className="p-3 text-xs">
                      {call.questionGroupName ?? "-"}
                    </td>
                    <td className="p-3">{formatDuration(call.duration)}</td>
                    <td className="p-3 text-right font-mono">
                      {call.qaScore != null ? (
                        <span
                          className={cn(
                            "font-semibold",
                            call.qaScore > 80
                              ? "text-green-600"
                              : call.qaScore > 50
                                ? "text-yellow-600"
                                : "text-red-600"
                          )}
                        >
                          {call.qaScore}%
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="p-3">
                      <StatusBadge status={call.processingStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {calls && calls.length > 0 && (
          <div className="text-sm text-muted-foreground">
            Showing {calls.length} most recent calls
          </div>
        )}
      </div>
    </div>
  );
}
