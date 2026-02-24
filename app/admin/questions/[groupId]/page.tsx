"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EyeIcon } from "lucide-react";
import { toast } from "sonner";

interface QuestionFormData {
  question: string;
  context: string;
  referenceScript: string;
  goodExamples: string[];
  badExamples: string[];
  isActive: boolean;
}

const emptyForm: QuestionFormData = {
  question: "",
  context: "",
  referenceScript: "",
  goodExamples: [],
  badExamples: [],
  isActive: true,
};

function EditableList({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function addItem() {
    if (draft.trim()) {
      onChange([...items, draft.trim()]);
      setDraft("");
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <div className="space-y-1 mb-2">
        {items.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-xs bg-muted rounded px-2 py-1"
          >
            <span className="flex-1 truncate">{item}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="h-5 w-5 text-destructive hover:text-destructive/80"
            >
              x
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem())}
          className="flex-1 rounded-md border px-3 py-1 text-sm"
          placeholder="Add item..."
        />
        <Button variant="secondary" size="sm" onClick={addItem}>
          Add
        </Button>
      </div>
    </div>
  );
}

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

function QuestionPromptPreviewDialog({
  systemPrompt,
  form,
}: {
  systemPrompt: string;
  form: QuestionFormData;
}) {
  const hasPlaceholder = systemPrompt.includes("{{agentName}}");
  const resolvedSystemPrompt = hasPlaceholder
    ? systemPrompt.replaceAll("{{agentName}}", "Jan Kowalski")
    : `${systemPrompt}\nAgent prowadzacy rozmowe: Jan Kowalski.\n`;

  const contextSection = form.context
    ? `\n<rules>\n${form.context}\n</rules>\n`
    : "";

  const referenceSection = form.referenceScript
    ? `\n<reference_script>\n${form.referenceScript}\n</reference_script>\n`
    : "";

  const goodExamplesSection = form.goodExamples.length
    ? `\n<examples_positive>\n${form.goodExamples.map((e) => `- "${e}"`).join("\n")}\n</examples_positive>\n`
    : "";

  const badExamplesSection = form.badExamples.length
    ? `\n<examples_negative>\n${form.badExamples.map((e) => `- "${e}"`).join("\n")}\n</examples_negative>\n`
    : "";

  const userPrompt = `<transcription>
{transcription}
</transcription>

<question>
${form.question || "{question}"}
</question>
${contextSection}${referenceSection}${goodExamplesSection}${badExamplesSection}
<possible_answers>
{possibleAnswers}
</possible_answers>`;

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
            <h3 className="text-sm font-semibold">User Prompt</h3>
            <p className="text-xs text-muted-foreground">
              Dynamic parts are highlighted. Current question data is inlined where available.
            </p>
            <pre className="whitespace-pre-wrap text-sm bg-muted p-3 rounded-md border font-mono leading-relaxed">
              <HighlightedPrompt
                text={userPrompt}
                highlights={["{transcription}", "{question}", "{possibleAnswers}"]}
              />
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReviewerFeedbackPanel({ questionId }: { questionId: string }) {
  const feedback = useQuery(api.promptFeedback.listOpenByQuestion, { questionId });
  const resolveFeedback = useMutation(api.promptFeedback.resolve);

  if (!feedback || feedback.length === 0) return null;

  async function handleResolve(id: Id<"promptFeedback">, status: "resolved" | "dismissed") {
    try {
      await resolveFeedback({ id, status });
      toast.success(status === "resolved" ? "Feedback resolved" : "Feedback dismissed");
    } catch {
      toast.error("Failed to update feedback");
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Reviewer Feedback ({feedback.length})</h3>
      <div className="space-y-2">
        {feedback.map((fb) => (
          <div key={fb._id} className="rounded-md border bg-muted/20 px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{fb.authorName}</span>
                <span>{new Date(fb.createdAt).toLocaleDateString()}</span>
              </div>
              <Link
                href={`/calls/${fb.callDocId}`}
                className="text-xs text-primary hover:underline"
                target="_blank"
              >
                View call
              </Link>
            </div>
            {fb.reviewerAnswer && fb.reviewerAnswer !== fb.aiAnswer && (
              <p className="text-xs">
                <span className="text-muted-foreground">AI: </span>
                <span className="line-through text-muted-foreground">{fb.aiAnswer}</span>
                {" "}
                <span className="font-medium">{fb.reviewerAnswer}</span>
              </p>
            )}
            <p className="text-sm">{fb.comment}</p>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="secondary"
                className="h-6 px-2 text-xs"
                onClick={() => handleResolve(fb._id, "resolved")}
              >
                Resolve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => handleResolve(fb._id, "dismissed")}
              >
                Dismiss
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function QuestionsPage() {
  const router = useRouter();
  const { isLoading, isAdmin } = useCurrentUser();
  const { groupId } = useParams<{ groupId: string }>();
  const typedGroupId = groupId as Id<"questionGroups">;

  const group = useQuery(api.questionGroups.get, { id: typedGroupId });

  if (!isLoading && !isAdmin) {
    router.push("/");
    return null;
  }
  const questions = useQuery(api.questions.listAllByGroup, {
    groupId: typedGroupId,
  });
  const createQuestion = useMutation(api.questions.create);
  const updateQuestion = useMutation(api.questions.update);
  const removeQuestion = useMutation(api.questions.remove);
  const reorderQuestions = useMutation(api.questions.reorder);

  const questionIds = useMemo(
    () => questions?.map((q) => q.questionId) ?? [],
    [questions],
  );
  const feedbackCounts = useQuery(
    api.promptFeedback.countOpenByQuestions,
    questionIds.length > 0 ? { questionIds } : "skip",
  );

  const [editing, setEditing] = useState<Id<"questions"> | "new" | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [form, setForm] = useState<QuestionFormData>(emptyForm);

  function startCreate() {
    setForm(emptyForm);
    setEditing("new");
    setEditingQuestionId(null);
  }

  function startEdit(q: NonNullable<typeof questions>[number]) {
    setForm({
      question: q.question,
      context: q.context,
      referenceScript: q.referenceScript ?? "",
      goodExamples: q.goodExamples ?? [],
      badExamples: q.badExamples ?? [],
      isActive: q.isActive,
    });
    setEditing(q._id);
    setEditingQuestionId(q.questionId);
  }

  async function handleSave() {
    if (editing === "new") {
      await createQuestion({
        groupId: typedGroupId,
        question: form.question,
        context: form.context,
        referenceScript: form.referenceScript || undefined,
        goodExamples:
          form.goodExamples.length > 0 ? form.goodExamples : undefined,
        badExamples:
          form.badExamples.length > 0 ? form.badExamples : undefined,
        sortOrder: questions?.length ?? 0,
        isActive: form.isActive,
      });
    } else if (editing) {
      await updateQuestion({
        id: editing,
        question: form.question,
        context: form.context,
        referenceScript: form.referenceScript || undefined,
        goodExamples:
          form.goodExamples.length > 0 ? form.goodExamples : undefined,
        badExamples:
          form.badExamples.length > 0 ? form.badExamples : undefined,
        isActive: form.isActive,
      });
    }
    setEditing(null);
  }

  async function moveQuestion(index: number, direction: "up" | "down") {
    if (!questions) return;
    const sorted = [...questions].sort((a, b) => a.sortOrder - b.sortOrder);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    const updates = [
      { id: sorted[index]._id, sortOrder: sorted[targetIndex].sortOrder },
      { id: sorted[targetIndex]._id, sortOrder: sorted[index].sortOrder },
    ];
    await reorderQuestions({ updates });
  }

  if (!group || !questions) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse h-8 bg-muted rounded w-64" />
      </div>
    );
  }

  const sortedQuestions = [...questions].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/question-groups"
          className="text-muted-foreground hover:text-foreground"
        >
          &larr; Back
        </Link>
        <h1 className="text-2xl font-bold">
          Questions: {group.displayName}
        </h1>
        <Button className="ml-auto" onClick={startCreate}>
          Add Question
        </Button>
      </div>

      {editing !== null && (
        <div className="rounded-lg border bg-card p-6 space-y-4 animate-fade-in-up">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              {editing === "new" ? "Add Question" : "Edit Question"}
            </h2>
            <QuestionPromptPreviewDialog
              systemPrompt={group.systemPrompt}
              form={form}
            />
          </div>

          <div className="flex items-center">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    isActive: e.target.checked,
                  }))
                }
                className="rounded"
              />
              Active
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Question</label>
            <textarea
              value={form.question}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, question: e.target.value }))
              }
              className="w-full rounded-md border px-3 py-2 text-sm min-h-[60px]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Context / Rules
            </label>
            <textarea
              value={form.context}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, context: e.target.value }))
              }
              className="w-full rounded-md border px-3 py-2 text-sm min-h-[120px]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Reference Script
            </label>
            <textarea
              value={form.referenceScript}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  referenceScript: e.target.value,
                }))
              }
              className="w-full rounded-md border px-3 py-2 text-sm min-h-[60px]"
            />
          </div>

          <EditableList
            label="Good Examples"
            items={form.goodExamples}
            onChange={(goodExamples) =>
              setForm((prev) => ({ ...prev, goodExamples }))
            }
          />

          <EditableList
            label="Bad Examples"
            items={form.badExamples}
            onChange={(badExamples) =>
              setForm((prev) => ({ ...prev, badExamples }))
            }
          />

          {editingQuestionId && (
            <ReviewerFeedbackPanel questionId={editingQuestionId} />
          )}

          <div className="flex gap-2">
            <Button onClick={handleSave}>Save</Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium w-10">#</th>
              <th className="text-left p-3 font-medium">Question</th>
              <th className="text-left p-3 font-medium">Active</th>
              <th className="text-right p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedQuestions.map((q, index) => (
              <tr
                key={q._id}
                className={`hover:bg-muted/30 transition-colors ${!q.isActive ? "opacity-50" : ""}`}
              >
                <td className="p-3 text-muted-foreground">
                  <div className="flex flex-col gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => moveQuestion(index, "up")}
                      disabled={index === 0}
                      className="h-5 w-5 text-xs"
                    >
                      &uarr;
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => moveQuestion(index, "down")}
                      disabled={index === sortedQuestions.length - 1}
                      className="h-5 w-5 text-xs"
                    >
                      &darr;
                    </Button>
                  </div>
                </td>
                <td className="p-3 max-w-md">
                  <div className="flex items-center gap-2">
                    <span className="truncate">{q.question}</span>
                    {feedbackCounts?.[q.questionId] && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {feedbackCounts[q.questionId]} feedback
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${q.isActive ? "bg-green-500" : "bg-gray-300"}`}
                  />
                </td>
                <td className="p-3 text-right space-x-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => startEdit(q)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeQuestion({ id: q._id })}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sortedQuestions.length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          No questions yet. Click &ldquo;Add Question&rdquo; to create one.
        </div>
      )}
    </div>
  );
}
