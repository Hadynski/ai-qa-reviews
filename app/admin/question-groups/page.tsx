"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { Button } from "@/components/ui/button";

export default function QuestionGroupsPage() {
  const router = useRouter();
  const { isLoading, isAdmin } = useCurrentUser();

  const groups = useQuery(api.questionGroups.list);
  const statuses = useQuery(api.daktelaStatuses.list);
  const removeGroup = useMutation(api.questionGroups.remove);

  if (!isLoading && !isAdmin) {
    router.push("/");
    return null;
  }

  if (!groups) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse h-8 bg-muted rounded w-64" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Question Groups</h1>
        <Button asChild>
          <Link href="/admin/question-groups/new">Create Group</Link>
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Name</th>
              <th className="text-left p-3 font-medium">Statuses</th>
              <th className="text-left p-3 font-medium">Active</th>
              <th className="text-right p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {groups.map((group) => (
              <tr
                key={group._id}
                className="hover:bg-muted/30 transition-colors"
              >
                <td className="p-3">{group.displayName}</td>
                <td className="p-3">
                  {group.statusIds.length > 0
                    ? group.statusIds
                        .map((statusId) => {
                          const status = statuses?.find(
                            (item) => item.statusId === statusId
                          );
                          return status?.title || statusId;
                        })
                        .join(", ")
                    : "None"}
                </td>
                <td className="p-3">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${group.isActive ? "bg-green-500" : "bg-gray-300"}`}
                  />
                </td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" asChild>
                      <Link href={`/admin/questions/${group._id}`}>
                        Questions
                      </Link>
                    </Button>
                    <Button variant="secondary" size="sm" asChild>
                      <Link href={`/admin/question-groups/${group._id}`}>
                        Edit
                      </Link>
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removeGroup({ id: group._id })}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
