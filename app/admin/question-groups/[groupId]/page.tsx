"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EyeIcon } from "lucide-react";
import { toast } from "sonner";

interface GroupFormData {
  displayName: string;
  systemPrompt: string;
  isActive: boolean;
  statusIds: string[];
}

const emptyForm: GroupFormData = {
  displayName: "",
  systemPrompt: "",
  isActive: true,
  statusIds: [],
};

const USER_PROMPT_TEMPLATE = `<transcription>
{transcription}
</transcription>

<question>
{question}
</question>

<rules>
{context}
</rules>

<reference_script>
{referenceScript}
</reference_script>

<examples_positive>
- {goodExamples}
</examples_positive>

<examples_negative>
- {badExamples}
</examples_negative>

<possible_answers>
- {possibleAnswers}
</possible_answers>`;

function HighlightedPrompt({ text, highlights }: { text: string; highlights: string[] }) {
  if (!highlights.length) return <span>{text}</span>;

  const pattern = new RegExp(`(${highlights.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) =>
        highlights.includes(part) ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function PromptPreviewDialog({ systemPrompt }: { systemPrompt: string }) {
  const hasPlaceholder = systemPrompt.includes("{{agentName}}");
  const resolvedSystemPrompt = hasPlaceholder
    ? systemPrompt.replaceAll("{{agentName}}", "Jan Kowalski")
    : `${systemPrompt}\nAgent prowadzacy rozmowe: Jan Kowalski.\n`;

  const userPromptHighlights = [
    "{transcription}",
    "{question}",
    "{context}",
    "{referenceScript}",
    "{goodExamples}",
    "{badExamples}",
    "{possibleAnswers}",
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6" title="Preview full prompt">
          <EyeIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prompt Preview</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">System Prompt</h3>
            {hasPlaceholder ? (
              <p className="text-xs text-muted-foreground">
                {"{{agentName}}"} resolved with example value &quot;Jan Kowalski&quot;
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                No {"{{agentName}}"} placeholder found — agent info will be appended at the end
              </p>
            )}
            <pre className="whitespace-pre-wrap text-sm bg-muted p-3 rounded-md border font-mono leading-relaxed">
              <HighlightedPrompt
                text={resolvedSystemPrompt}
                highlights={hasPlaceholder ? ["Jan Kowalski"] : ["Agent prowadzacy rozmowe: Jan Kowalski.\n"]}
              />
            </pre>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">User Prompt Template</h3>
            <p className="text-xs text-muted-foreground">
              Dynamic parts are highlighted. Constructed per question during analysis.
            </p>
            <pre className="whitespace-pre-wrap text-sm bg-muted p-3 rounded-md border font-mono leading-relaxed">
              <HighlightedPrompt text={USER_PROMPT_TEMPLATE} highlights={userPromptHighlights} />
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function QuestionGroupEditPage() {
  const params = useParams();
  const router = useRouter();
  const { isLoading: authLoading, isAdmin } = useCurrentUser();

  const groupId = params.groupId as string;
  const isNew = groupId === "new";

  const group = useQuery(
    api.questionGroups.get,
    isNew ? "skip" : { id: groupId as Id<"questionGroups"> }
  );
  const statuses = useQuery(api.daktelaStatuses.list);
  const createGroup = useMutation(api.questionGroups.create);
  const updateGroup = useMutation(api.questionGroups.update);

  const [form, setForm] = useState<GroupFormData>(emptyForm);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusSearch, setStatusSearch] = useState("");

  useEffect(() => {
    if (!isNew && group && !initialized) {
      setForm({
        displayName: group.displayName,
        systemPrompt: group.systemPrompt,
        isActive: group.isActive,
        statusIds: group.statusIds,
      });
      setInitialized(true);
    }
  }, [isNew, group, initialized]);

  const filteredStatuses = useMemo(() => {
    if (!statuses) return [];
    if (!statusSearch.trim()) return statuses;
    const query = statusSearch.toLowerCase();
    return statuses.filter(
      (s) =>
        s.title?.toLowerCase().includes(query) ||
        s.statusId.toLowerCase().includes(query)
    );
  }, [statuses, statusSearch]);

  if (!authLoading && !isAdmin) {
    router.push("/");
    return null;
  }

  if (!isNew && group === undefined) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse h-8 bg-muted rounded w-64" />
      </div>
    );
  }

  if (!isNew && group === null) {
    return (
      <div className="container mx-auto p-6 space-y-4">
        <p className="text-muted-foreground">Question group not found.</p>
        <Button variant="outline" asChild>
          <Link href="/admin/question-groups">Back to Question Groups</Link>
        </Button>
      </div>
    );
  }

  function toggleStatusId(statusId: string) {
    setForm((prev) => ({
      ...prev,
      statusIds: prev.statusIds.includes(statusId)
        ? prev.statusIds.filter((s) => s !== statusId)
        : [...prev.statusIds, statusId],
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (isNew) {
        await createGroup(form);
      } else {
        await updateGroup({
          id: groupId as Id<"questionGroups">,
          ...form,
        });
      }
      router.push("/admin/question-groups");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save group"
      );
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = form.statusIds.length;

  return (
    <div className="container mx-auto p-6 space-y-6 animate-fade-in-up">
      <Link
        href="/admin/question-groups"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        &larr; Back to Question Groups
      </Link>

      <h1 className="text-2xl font-bold">
        {isNew ? "Create Question Group" : "Edit Question Group"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Group Details</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="displayName">Name</Label>
            <Input
              id="displayName"
              value={form.displayName}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  displayName: e.target.value,
                }))
              }
              placeholder="First Contact"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="systemPrompt">System Prompt</Label>
              <PromptPreviewDialog systemPrompt={form.systemPrompt} />
            </div>
            <Textarea
              id="systemPrompt"
              value={form.systemPrompt}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  systemPrompt: e.target.value,
                }))
              }
              placeholder="System prompt for AI analysis..."
              className="min-h-[200px] font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Use <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{"{{agentName}}"}</code> to insert the agent name at a specific position.
              If omitted, agent info is appended automatically.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="isActive"
              checked={form.isActive}
              onCheckedChange={(checked) =>
                setForm((prev) => ({
                  ...prev,
                  isActive: checked === true,
                }))
              }
            />
            <Label htmlFor="isActive">Active</Label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Linked Statuses</Label>
              {selectedCount > 0 && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                  {selectedCount} selected
                </span>
              )}
            </div>
            <div className="rounded-md border">
              <div className="p-2 border-b">
                <Input
                  placeholder="Search statuses..."
                  value={statusSearch}
                  onChange={(e) => setStatusSearch(e.target.value)}
                  className="h-8"
                />
              </div>
              <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
                {filteredStatuses.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2 px-1">
                    {statuses?.length === 0
                      ? "No statuses available."
                      : "No statuses match your search."}
                  </p>
                ) : (
                  filteredStatuses.map((status) => (
                    <label
                      key={status.statusId}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={form.statusIds.includes(status.statusId)}
                        onCheckedChange={() => toggleStatusId(status.statusId)}
                      />
                      <span className="text-sm">
                        {status.title || status.statusId}
                      </span>
                      {status.title && (
                        <span className="text-xs text-muted-foreground font-mono">
                          {status.statusId}
                        </span>
                      )}
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex gap-2 border-t">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/question-groups">Cancel</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
