"use client";

import { use, useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EyeIcon, MessageSquarePlusIcon } from "lucide-react";
import { toast } from "sonner";

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "-";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function DirectionBadge({ direction }: { direction: string | null }) {
  if (!direction) return null;
  const isInbound = direction === "in";
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        isInbound
          ? "bg-cyan-100 text-cyan-800"
          : "bg-violet-100 text-violet-800",
      )}
    >
      {isInbound ? "Inbound" : "Outbound"}
    </span>
  );
}

function AnswerBadge({ answer }: { answer: string }) {
  const color =
    answer === "Tak"
      ? "bg-green-100 text-green-800"
      : "bg-red-100 text-red-800";
  return (
    <span
      className={cn(
        "inline-flex items-center px-3 py-1 rounded-md text-sm font-semibold",
        color,
      )}
    >
      {answer}
    </span>
  );
}

function QaScoreSummary({
  results,
}: {
  results: { answer: string }[];
}) {
  const takCount = results.filter((r) => r.answer === "Tak").length;
  const total = results.length;
  const percentage = total > 0 ? Math.round((takCount / total) * 100) : 0;
  const color =
    percentage > 80
      ? "text-green-600"
      : percentage > 50
        ? "text-yellow-600"
        : "text-red-600";

  return (
    <Card>
      <CardHeader>
        <CardTitle>QA Score</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-3">
          <span className={cn("text-4xl font-bold tabular-nums font-mono", color)}>
            {takCount}/{total}
          </span>
          <span className={cn("text-2xl font-semibold", color)}>
            {percentage}%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function InlineAnswerEditor({
  callId,
  questionId,
  currentAnswer,
  currentJustification,
  possibleAnswers,
  onClose,
}: {
  callId: string;
  questionId: string;
  currentAnswer: string;
  currentJustification: string;
  possibleAnswers: string[];
  onClose: () => void;
}) {
  const [answer, setAnswer] = useState(currentAnswer);
  const [justification, setJustification] = useState(currentJustification);
  const updateAnswer = useMutation(api.transcriptions.updateSingleQaAnswer);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateAnswer({ callId, questionId, answer, justification });
      toast.success("Answer updated");
      onClose();
    } catch (err) {
      toast.error("Failed to update answer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border bg-muted/40 p-4 space-y-4 animate-expand-down">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Answer
        </label>
        <Select value={answer} onValueChange={setAnswer}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {possibleAnswers.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Justification
        </label>
        <Textarea
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          rows={3}
        />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

interface QuestionData {
  questionId: string;
  possibleAnswers: string[];
  context?: string;
  referenceScript?: string;
  goodExamples?: string[];
  badExamples?: string[];
}

interface FeedbackItem {
  _id: Id<"promptFeedback">;
  questionId: string;
  authorName: string;
  aiAnswer: string;
  reviewerAnswer?: string;
  comment: string;
  status: string;
  createdAt: number;
}

function PromptDetailsPanel({ question }: { question: QuestionData }) {
  const hasContent = question.context || question.referenceScript ||
    (question.goodExamples && question.goodExamples.length > 0) ||
    (question.badExamples && question.badExamples.length > 0);

  if (!hasContent) {
    return (
      <div className="mt-3 rounded-lg border bg-muted/40 p-4 animate-expand-down">
        <p className="text-sm text-muted-foreground">No prompt details configured for this question.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border bg-muted/40 p-4 space-y-3 animate-expand-down">
      {question.context && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Rules / Context</p>
          <p className="text-sm whitespace-pre-wrap">{question.context}</p>
        </div>
      )}
      {question.referenceScript && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Reference Script</p>
          <p className="text-sm whitespace-pre-wrap">{question.referenceScript}</p>
        </div>
      )}
      {question.goodExamples && question.goodExamples.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Positive Examples</p>
          <ul className="list-disc list-inside space-y-0.5">
            {question.goodExamples.map((ex, i) => (
              <li key={i} className="text-sm">{ex}</li>
            ))}
          </ul>
        </div>
      )}
      {question.badExamples && question.badExamples.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Negative Examples</p>
          <ul className="list-disc list-inside space-y-0.5">
            {question.badExamples.map((ex, i) => (
              <li key={i} className="text-sm">{ex}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InlineFeedbackForm({
  callId,
  questionId,
  aiAnswer,
  possibleAnswers,
  onClose,
}: {
  callId: string;
  questionId: string;
  aiAnswer: string;
  possibleAnswers: string[];
  onClose: () => void;
}) {
  const [reviewerAnswer, setReviewerAnswer] = useState<string>("");
  const [comment, setComment] = useState("");
  const createFeedback = useMutation(api.promptFeedback.create);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!comment.trim()) {
      toast.error("Comment is required");
      return;
    }
    setSaving(true);
    try {
      await createFeedback({
        questionId,
        callId,
        aiAnswer,
        reviewerAnswer: reviewerAnswer || undefined,
        comment: comment.trim(),
      });
      toast.success("Feedback submitted");
      onClose();
    } catch {
      toast.error("Failed to submit feedback");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border bg-muted/40 p-4 space-y-4 animate-expand-down">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          AI Answer
        </label>
        <p className="text-sm font-medium">{aiAnswer}</p>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Correct Answer (optional)
        </label>
        <Select value={reviewerAnswer} onValueChange={setReviewerAnswer}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {possibleAnswers.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Comment *
        </label>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Explain why the AI answer is wrong or how the prompt should be improved..."
        />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" onClick={handleSubmit} disabled={saving || !comment.trim()}>
          {saving ? "Submitting..." : "Submit Feedback"}
        </Button>
        <Button size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function FeedbackDisplay({ items }: { items: FeedbackItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {items.map((fb) => (
        <div key={fb._id} className="rounded-md border bg-muted/20 px-3 py-2 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{fb.authorName}</span>
            <span>{new Date(fb.createdAt).toLocaleDateString()}</span>
            <Badge
              variant={fb.status === "open" ? "default" : "secondary"}
              className="text-[10px] px-1.5 py-0"
            >
              {fb.status}
            </Badge>
          </div>
          {fb.reviewerAnswer && fb.reviewerAnswer !== fb.aiAnswer && (
            <p className="text-xs">
              <span className="text-muted-foreground">Correction: </span>
              <span className="line-through text-muted-foreground">{fb.aiAnswer}</span>
              {" "}
              <span className="font-medium">{fb.reviewerAnswer}</span>
            </p>
          )}
          <p className="text-sm">{fb.comment}</p>
        </div>
      ))}
    </div>
  );
}

function QaAnalysisSection({
  callId,
  results,
  questions,
  feedback,
  isReviewer,
}: {
  callId: string;
  results: {
    questionId: string;
    question: string;
    answer: string;
    justification: string;
  }[];
  questions: QuestionData[] | undefined;
  feedback: FeedbackItem[] | undefined;
  isReviewer: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [promptDetailId, setPromptDetailId] = useState<string | null>(null);
  const [feedbackFormId, setFeedbackFormId] = useState<string | null>(null);
  const questionsMap = new Map(questions?.map((q) => [q.questionId, q]));

  const feedbackByQuestion = useMemo(() => {
    const map = new Map<string, FeedbackItem[]>();
    for (const fb of feedback ?? []) {
      const list = map.get(fb.questionId) ?? [];
      list.push(fb);
      map.set(fb.questionId, list);
    }
    return map;
  }, [feedback]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>QA Analysis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 divide-y">
        {results.map((result, i) => {
          const question = questionsMap.get(result.questionId);
          const isEditing = editingId === result.questionId;
          const showPrompt = promptDetailId === result.questionId;
          const showFeedbackForm = feedbackFormId === result.questionId;
          const questionFeedback = feedbackByQuestion.get(result.questionId) ?? [];

          return (
            <div key={result.questionId} className={cn("py-4", i === 0 && "pt-0")}>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug">
                    {result.question}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {result.justification}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <AnswerBadge answer={result.answer} />
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn("h-7 w-7 p-0", showPrompt && "bg-muted")}
                    onClick={() => setPromptDetailId(showPrompt ? null : result.questionId)}
                    title="View prompt details"
                  >
                    <EyeIcon className="h-3.5 w-3.5" />
                  </Button>
                  {isReviewer && !isEditing && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setEditingId(result.questionId)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={cn("h-7 w-7 p-0", showFeedbackForm && "bg-muted")}
                        onClick={() => setFeedbackFormId(showFeedbackForm ? null : result.questionId)}
                        title="Leave prompt feedback"
                      >
                        <MessageSquarePlusIcon className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {showPrompt && question && (
                <PromptDetailsPanel question={question} />
              )}
              {isEditing && question && (
                <InlineAnswerEditor
                  callId={callId}
                  questionId={result.questionId}
                  currentAnswer={result.answer}
                  currentJustification={result.justification}
                  possibleAnswers={question.possibleAnswers}
                  onClose={() => setEditingId(null)}
                />
              )}
              {showFeedbackForm && question && (
                <InlineFeedbackForm
                  callId={callId}
                  questionId={result.questionId}
                  aiAnswer={result.answer}
                  possibleAnswers={question.possibleAnswers}
                  onClose={() => setFeedbackFormId(null)}
                />
              )}
              <FeedbackDisplay items={questionFeedback} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TranscriptionSection({
  text,
  utterances,
}: {
  text: string;
  utterances?: { speaker: number; transcript: string; start: number; end: number }[];
}) {
  if (!utterances || utterances.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Transcription</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{text}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transcription</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 divide-y">
        {utterances.map((u, i) => (
          <div key={i} className={cn("flex gap-4 py-2.5", i === 0 && "pt-0")}>
            <span className="text-xs font-mono text-muted-foreground tabular-nums shrink-0 pt-0.5 w-12 text-right">
              {formatTimestamp(u.start)}
            </span>
            <p className="text-sm leading-relaxed">{u.transcript}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AdminActions({
  callId,
  call,
  hasAnalysis,
}: {
  callId: Id<"calls">;
  call: { callId: string; activityName: string };
  hasAnalysis: boolean;
}) {
  const reprocessCall = useMutation(api.calls.reprocessCall);
  const clearQaAnalysis = useMutation(api.transcriptions.clearQaAnalysis);
  const removeCall = useMutation(api.calls.remove);

  async function handleReprocess() {
    try {
      await reprocessCall({ callId });
      toast.success("Call queued for reprocessing");
    } catch {
      toast.error("Failed to reprocess call");
    }
  }

  async function handleClearQa() {
    try {
      await clearQaAnalysis({ callId: call.callId });
      toast.success("QA analysis cleared");
    } catch {
      toast.error("Failed to clear QA analysis");
    }
  }

  async function handleDelete() {
    try {
      await removeCall({ id: callId });
      toast.success("Call deleted");
      window.location.href = "/";
    } catch {
      toast.error("Failed to delete call");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={handleReprocess}>
        Reprocess Call
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={handleClearQa}
        disabled={!hasAnalysis}
      >
        Clear QA Analysis
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="destructive">
            Delete Call
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this call?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the call record. The transcription
              and QA analysis will remain orphaned. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const callId = id as Id<"calls">;
  const { isAdmin, isReviewer } = useCurrentUser();

  const call = useQuery(api.calls.getWithAgent, { id: callId });
  const transcription = useQuery(
    api.transcriptions.getByCallId,
    call ? { callId: call.callId } : "skip",
  );
  const questions = useQuery(
    api.questions.listByGroup,
    call?.questionGroupId ? { groupId: call.questionGroupId } : "skip",
  );
  const feedback = useQuery(
    api.promptFeedback.listByCall,
    call ? { callId: call.callId } : "skip",
  );

  if (call === undefined) {
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

  if (call === null) {
    return (
      <div className="container mx-auto p-6 space-y-4">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back to Pipeline
        </Link>
        <p className="text-muted-foreground">Call not found.</p>
      </div>
    );
  }

  const qaResults = transcription?.qaAnalysis?.results;

  return (
    <div className="container mx-auto p-6 space-y-6 animate-fade-in-up">
      <Link
        href="/"
        className="inline-block text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        &larr; Back to Pipeline
      </Link>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">
              {new Date(call.callTime).toLocaleString()}
            </h1>
            <DirectionBadge direction={call.direction} />
            <StatusBadge status={call.processingStatus} />
          </div>
          {isAdmin && (
            <AdminActions
              callId={callId}
              call={{ callId: call.callId, activityName: call.activityName }}
              hasAnalysis={!!qaResults}
            />
          )}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span>
            Duration: <span className="font-mono text-foreground">{formatDuration(call.duration)}</span>
          </span>
          <span>
            Call ID: <span className="font-mono text-foreground">{call.callId}</span>
          </span>
        </div>
      </div>

      {/* Participants */}
      <Card>
        <CardHeader>
          <CardTitle>Participants</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Agent</dt>
              <dd className="font-medium">
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
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Contact</dt>
              <dd className="font-medium">
                {[call.contactFirstname, call.contactLastname]
                  .filter(Boolean)
                  .join(" ") || "-"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Account</dt>
              <dd className="font-medium">{call.accountName ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Queue</dt>
              <dd className="font-medium">{call.queueName ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">CLID</dt>
              <dd className="font-mono">{call.clid ?? "-"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* QA Score Summary */}
      {qaResults && <QaScoreSummary results={qaResults} />}

      {/* Processing Error */}
      {call.processingStatus === "failed" && call.processingError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-red-800">
              {call.processingError}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Audio Player */}
      <Card>
        <CardHeader>
          <CardTitle>Recording</CardTitle>
        </CardHeader>
        <CardContent>
          <audio
            controls
            className="w-full"
            src={`/api/daktela/recording/${call.activityName}`}
          />
        </CardContent>
      </Card>

      {/* QA Analysis */}
      {qaResults && (
        <QaAnalysisSection
          callId={call.callId}
          results={qaResults}
          questions={questions ?? undefined}
          feedback={feedback ?? undefined}
          isReviewer={isReviewer}
        />
      )}

      {/* Transcription */}
      {transcription && (
        <TranscriptionSection
          text={transcription.text}
          utterances={transcription.utterances}
        />
      )}

    </div>
  );
}
