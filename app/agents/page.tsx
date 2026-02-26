"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

export default function AgentsPage() {
  const agents = useQuery(api.agents.list);
  const ranking = useQuery(api.stats.listAgentRanking);

  if (!agents) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  const rankingMap = new Map(
    ranking?.map((r) => [r.agentId as string, r])
  );

  return (
    <div className="container mx-auto p-6 space-y-6 animate-fade-in-up">
      <h1 className="text-2xl font-bold">Agents</h1>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Display Name</th>
              <th className="text-left p-3 font-medium">Username</th>
              <th className="text-right p-3 font-medium">Analyzed</th>
              <th className="text-right p-3 font-medium">Avg Score</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {agents.map((agent) => {
              const stats = rankingMap.get(agent._id as string);
              return (
                <tr key={agent._id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <Link
                      href={`/agents/${agent._id}`}
                      className="text-primary underline-offset-4 hover:underline font-medium"
                    >
                      {agent.displayName}
                    </Link>
                  </td>
                  <td className="p-3 font-mono text-xs">{agent.username}</td>
                  <td className="p-3 text-right font-mono">
                    {stats?.analyzedCount ?? "-"}
                  </td>
                  <td className="p-3 text-right font-mono">
                    {stats ? (
                      <span
                        className={cn(
                          "font-semibold",
                          stats.averageScore > 80
                            ? "text-green-600"
                            : stats.averageScore > 50
                              ? "text-yellow-600"
                              : "text-red-600"
                        )}
                      >
                        {stats.averageScore}%
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-sm text-muted-foreground">
        {agents.length} {agents.length === 1 ? "agent" : "agents"}
      </div>
    </div>
  );
}
