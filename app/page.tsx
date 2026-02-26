"use client";

import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";

export default function PipelineDashboard() {
  const callsData = useQuery(api.calls.list, { limit: 50 });
  const failedCalls = useQuery(api.calls.listByStatus, {
    processingStatus: "failed",
    limit: 20,
  });
  const retryFailed = useMutation(api.calls.retryFailedCall);
  const reprocessCall = useMutation(api.calls.reprocessCall);

  if (!callsData) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6 animate-fade-in-up">
      <h1 className="text-2xl font-bold">Pipeline Dashboard</h1>

      {failedCalls && failedCalls.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-red-700">
            Failed Calls ({failedCalls.length})
          </h2>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Call ID</th>
                  <th className="text-left p-3 font-medium">Agent</th>
                  <th className="text-left p-3 font-medium">Error</th>
                  <th className="text-left p-3 font-medium">Retries</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {failedCalls.map((call) => (
                  <tr key={call._id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-mono text-xs">
                      <Link
                        href={`/calls/${call._id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {call.callId}
                      </Link>
                    </td>
                    <td className="p-3">
                      {call.agentId ? (
                        <Link
                          href={`/agents/${call.agentId}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {call.agentName ?? "-"}
                        </Link>
                      ) : (
                        call.agentName ?? "-"
                      )}
                    </td>
                    <td className="p-3 text-red-600 text-xs max-w-xs truncate">
                      {call.processingError ?? "Unknown error"}
                    </td>
                    <td className="p-3">{call.retryCount ?? 0}</td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        onClick={() =>
                          retryFailed({
                            callId: call._id as Id<"calls">,
                          })
                        }
                      >
                        Retry
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Recent Calls</h2>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Call Time</th>
                <th className="text-left p-3 font-medium">Call ID</th>
                <th className="text-left p-3 font-medium">Agent</th>
                <th className="text-left p-3 font-medium">Group</th>
                <th className="text-left p-3 font-medium">Duration</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {callsData.calls.map((call) => (
                <tr key={call._id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3 text-xs">
                    {new Date(call.callTime).toLocaleString()}
                  </td>
                  <td className="p-3 font-mono text-xs">
                    <Link
                      href={`/calls/${call._id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {call.callId}
                    </Link>
                  </td>
                  <td className="p-3">
                    {call.agentId ? (
                      <Link
                        href={`/agents/${call.agentId}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {call.agentName ?? "-"}
                      </Link>
                    ) : (
                      call.agentName ?? "-"
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    {call.questionGroupName ?? "-"}
                  </td>
                  <td className="p-3">
                    {call.duration != null
                      ? `${Math.floor(call.duration / 60)}m ${Math.round(call.duration % 60)}s`
                      : "-"}
                  </td>
                  <td className="p-3">
                    <StatusBadge status={call.processingStatus} />
                  </td>
                  <td className="p-3 text-right">
                    {(call.processingStatus === "analyzed" ||
                      call.processingStatus === "failed") && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          reprocessCall({
                            callId: call._id as Id<"calls">,
                          })
                        }
                      >
                        Reprocess
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-sm text-muted-foreground">
          Showing {callsData.calls.length} of {callsData.total} calls
        </div>
      </div>
    </div>
  );
}
