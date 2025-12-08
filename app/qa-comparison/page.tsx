"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  RefreshCw,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Save,
  ArrowUpDown,
  Eye,
  RotateCcw,
} from "lucide-react";
import { QaComparison, calculateComparison } from "@/components/qa-comparison";
import { QaReviewItem, QaReviewsResponse } from "@/app/api/daktela/qa-reviews-bulk/route";
import { toast } from "sonner";

type ProcessingStatus = "idle" | "processing" | "completed" | "error";

type Utterance = {
  speaker: number;
  transcript: string;
  start: number;
  end: number;
};

function mergeConsecutiveUtterances(utterances: Utterance[]): Utterance[] {
  if (utterances.length === 0) return [];

  const merged: Utterance[] = [];
  let current = { ...utterances[0] };

  for (let i = 1; i < utterances.length; i++) {
    if (utterances[i].speaker === current.speaker) {
      current.transcript += ' ' + utterances[i].transcript;
      current.end = utterances[i].end;
    } else {
      merged.push(current);
      current = { ...utterances[i] };
    }
  }
  merged.push(current);

  return merged;
}

interface ReviewWithStatus extends QaReviewItem {
  processingStatus: ProcessingStatus;
  processingError?: string;
  hasTranscription?: boolean;
  hasAiAnalysis?: boolean;
  matchPercentage?: number;
}

export default function QaComparisonPage() {
  const [reviews, setReviews] = useState<ReviewWithStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [selectedReview, setSelectedReview] = useState<ReviewWithStatus | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [sortByMatch, setSortByMatch] = useState<"asc" | "desc" | null>("asc");
  const [transcriptionModalOpen, setTranscriptionModalOpen] = useState(false);
  const [transcriptionToView, setTranscriptionToView] = useState<{
    text: string;
    utterances?: Array<{ speaker: number; transcript: string; start: number; end: number }>;
  } | null>(null);
  const [reprocessDialog, setReprocessDialog] = useState<{
    open: boolean;
    type: "review" | "transcribe";
    review: ReviewWithStatus | null;
  }>({ open: false, type: "review", review: null });
  const [activeReprocess, setActiveReprocess] = useState<{
    reviewId: string;
    type: "review" | "transcribe";
  } | null>(null);

  // Load data from Convex
  const transcriptionsFromDB = useQuery(api.transcriptions.list);
  const qaReviewsFromDB = useQuery(api.qaReviews.list);

  // Convex mutations
  const upsertReviews = useMutation(api.qaReviews.upsertReviews);
  const updateReviewStatus = useMutation(api.qaReviews.updateStatus);
  const saveClientReviewMutation = useMutation(api.transcriptions.saveClientReview);

  // Load reviews from DB on mount
  useEffect(() => {
    if (qaReviewsFromDB && qaReviewsFromDB.length > 0 && reviews.length === 0) {
      const reviewsWithStatus: ReviewWithStatus[] = qaReviewsFromDB.map((review) => {
        const transcription = transcriptionsFromDB?.find(
          (t) => t.callId === review.callId
        );
        const humanReview = {
          reviewId: review.reviewId,
          activityName: review.activityName || "",
          qareviewAnswers: review.qareviewAnswers,
          reviewedAt: review.edited || review.created,
          reviewedBy: review.reviewedBy || undefined,
          fetchedAt: Date.now(),
        };
        const { metrics } = calculateComparison(transcription?.qaAnalysis, humanReview);
        return {
          reviewId: review.reviewId,
          activityName: review.activityName,
          callId: review.callId,
          qaformName: review.qaformName,
          created: review.created,
          edited: review.edited,
          reviewedBy: review.reviewedBy,
          reviewedOperator: review.reviewedOperator || null,
          qareviewAnswers: review.qareviewAnswers,
          processingStatus: (review.processingStatus as ProcessingStatus) ||
            (transcription?.qaAnalysis ? "completed" : "idle"),
          hasTranscription: !!transcription,
          hasAiAnalysis: !!transcription?.qaAnalysis,
          matchPercentage: transcription?.qaAnalysis ? metrics.agreementPercentage : undefined,
        };
      });
      setReviews(reviewsWithStatus);
    }
  }, [qaReviewsFromDB, transcriptionsFromDB, reviews.length]);

  // Update reviews status when transcriptions change
  useEffect(() => {
    if (transcriptionsFromDB !== undefined && reviews.length > 0) {
      setReviews((prev) =>
        prev.map((review) => {
          const transcription = transcriptionsFromDB?.find(
            (t) => t.callId === review.callId
          );
          const humanReview = {
            reviewId: review.reviewId,
            activityName: review.activityName || "",
            qareviewAnswers: review.qareviewAnswers,
            reviewedAt: review.edited || review.created,
            reviewedBy: review.reviewedBy || undefined,
            fetchedAt: Date.now(),
          };
          const { metrics } = calculateComparison(transcription?.qaAnalysis, humanReview);
          return {
            ...review,
            hasTranscription: !!transcription,
            hasAiAnalysis: !!transcription?.qaAnalysis,
            processingStatus:
              review.processingStatus === "processing"
                ? review.processingStatus
                : transcription?.qaAnalysis
                  ? "completed"
                  : review.processingStatus,
            matchPercentage: transcription?.qaAnalysis ? metrics.agreementPercentage : undefined,
          };
        })
      );
    }
  }, [transcriptionsFromDB]);

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("take", "50");
      params.append("pageSize", "50");
      if (dateFrom) {
        params.append("dateFrom", `${dateFrom} 00:00:00`);
      }
      if (dateTo) {
        params.append("dateTo", `${dateTo} 23:59:59`);
      }
      const qaformIds = [
        "qaforms_63e262bf81345924178800",
        "qaform_673b44c8a5025780649482",
        "qaform_67a06c4a4c85e030706387",
        "qaform_685e5519badc5878745176",
        "qaform_6874ae7203c6d540395571",
        "qaform_68beba06c3709685580900",
      ];
      qaformIds.forEach((id) => params.append("qaformId", id));

      const response = await fetch(`/api/daktela/qa-reviews-bulk?${params.toString()}`);

      if (response.ok) {
        const data: QaReviewsResponse = await response.json();

        // Save to Convex
        await upsertReviews({
          reviews: data.reviews.map((r) => ({
            reviewId: r.reviewId,
            activityName: r.activityName,
            callId: r.callId,
            qaformName: r.qaformName,
            created: r.created,
            edited: r.edited,
            reviewedBy: r.reviewedBy,
            reviewedOperator: r.reviewedOperator,
            qareviewAnswers: r.qareviewAnswers,
          })),
        });

        toast.success(`Fetched and saved ${data.reviews.length} reviews`);

        // Enrich with status from transcriptions DB
        const reviewsWithStatus: ReviewWithStatus[] = data.reviews.map((review) => {
          const transcription = transcriptionsFromDB?.find(
            (t) => t.callId === review.callId
          );
          return {
            ...review,
            processingStatus: transcription?.qaAnalysis ? "completed" : "idle",
            hasTranscription: !!transcription,
            hasAiAnalysis: !!transcription?.qaAnalysis,
          };
        });

        setReviews(reviewsWithStatus);
      } else {
        const errorData = await response.json();
        console.error("Failed to fetch reviews:", errorData.error);
        toast.error("Failed to fetch reviews");
      }
    } catch (error) {
      console.error("Failed to fetch reviews:", error);
      toast.error("Failed to fetch reviews");
    } finally {
      setLoading(false);
    }
  };

  const fetchCallIdForActivity = async (activityName: string): Promise<string | null> => {
    try {
      const response = await fetch(`/api/daktela/add-activity/${activityName}`, {
        method: "POST",
      });
      if (response.ok) {
        const data = await response.json();
        return data.callData?.callId || null;
      }
    } catch (error) {
      console.error("Failed to fetch callId:", error);
    }
    return null;
  };

  const processReview = async (review: ReviewWithStatus) => {
    if (!review.activityName) {
      console.error("Missing activityName");
      toast.error("Missing activity name");
      return;
    }

    setReviews((prev) =>
      prev.map((r) =>
        r.reviewId === review.reviewId
          ? { ...r, processingStatus: "processing" as ProcessingStatus }
          : r
      )
    );

    try {
      // If callId is missing, fetch it first
      let callId = review.callId;
      if (!callId) {
        callId = await fetchCallIdForActivity(review.activityName);
        if (!callId) {
          throw new Error("Could not fetch callId for activity");
        }
        // Update the review with the callId
        setReviews((prev) =>
          prev.map((r) =>
            r.reviewId === review.reviewId ? { ...r, callId } : r
          )
        );
      }

      const response = await fetch("/api/qa/process-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityName: review.activityName,
          callId,
          qareviewAnswers: review.qareviewAnswers,
          reviewId: review.reviewId,
          reviewedBy: review.reviewedBy,
          reviewedAt: review.edited || review.created,
        }),
      });

      if (response.ok) {
        const result = await response.json();

        // Update status in Convex
        await updateReviewStatus({
          reviewId: review.reviewId,
          processingStatus: result.error ? "error" : "completed",
          callId: callId || undefined,
        });

        if (result.error) {
          toast.error(`Processing failed: ${result.error}`);
        }

        setReviews((prev) =>
          prev.map((r) =>
            r.reviewId === review.reviewId
              ? {
                  ...r,
                  callId,
                  processingStatus: result.error ? "error" : "completed",
                  processingError: result.error,
                  hasTranscription: result.transcription,
                  hasAiAnalysis: result.aiAnalysis,
                }
              : r
          )
        );
      } else {
        const errorData = await response.json();
        const errorMessage = errorData.error || "Unknown error";
        toast.error(`Processing failed: ${errorMessage}`);
        await updateReviewStatus({
          reviewId: review.reviewId,
          processingStatus: "error",
        });
        setReviews((prev) =>
          prev.map((r) =>
            r.reviewId === review.reviewId
              ? {
                  ...r,
                  processingStatus: "error",
                  processingError: errorMessage,
                }
              : r
          )
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Processing failed: ${errorMessage}`);
      await updateReviewStatus({
        reviewId: review.reviewId,
        processingStatus: "error",
      });
      setReviews((prev) =>
        prev.map((r) =>
          r.reviewId === review.reviewId
            ? {
                ...r,
                processingStatus: "error",
                processingError: errorMessage,
              }
            : r
        )
      );
    }
  };

  const processBatch = async () => {
    setBatchProcessing(true);
    // Only require activityName, not callId (we'll fetch it if needed)
    const pendingReviews = reviews.filter(
      (r) =>
        r.processingStatus !== "completed" &&
        r.processingStatus !== "processing" &&
        r.activityName
    );

    toast.info(`Processing ${pendingReviews.length} reviews...`);

    for (const review of pendingReviews) {
      await processReview(review);
      // Small delay between processing to avoid overwhelming the API
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setBatchProcessing(false);
    toast.success("Batch processing completed");
  };

  const openComparison = (review: ReviewWithStatus) => {
    setSelectedReview(review);
    setModalOpen(true);
  };

  const getTranscriptionForReview = (review: ReviewWithStatus) => {
    return transcriptionsFromDB?.find((t) => t.callId === review.callId);
  };

  const openTranscriptionModal = (review: ReviewWithStatus) => {
    const transcription = getTranscriptionForReview(review);
    if (transcription?.text) {
      setTranscriptionToView({
        text: transcription.text,
        utterances: transcription.utterances,
      });
      setTranscriptionModalOpen(true);
    }
  };

  const openReprocessDialog = (type: "review" | "transcribe", review: ReviewWithStatus) => {
    setReprocessDialog({ open: true, type, review });
  };

  const closeReprocessDialog = () => {
    setReprocessDialog({ open: false, type: "review", review: null });
  };

  const handleConfirmReprocess = async () => {
    const { type, review } = reprocessDialog;
    if (!review || !review.callId) {
      toast.error("Missing review data or callId");
      closeReprocessDialog();
      return;
    }

    closeReprocessDialog();
    setActiveReprocess({ reviewId: review.reviewId, type });

    setReviews((prev) =>
      prev.map((r) =>
        r.reviewId === review.reviewId
          ? { ...r, processingStatus: "processing" as ProcessingStatus }
          : r
      )
    );

    try {
      if (type === "review") {
        const response = await fetch("/api/qa/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callId: review.callId, force: true }),
        });

        if (response.ok) {
          toast.success("AI analysis re-run successfully");
          await updateReviewStatus({
            reviewId: review.reviewId,
            processingStatus: "completed",
          });
          setReviews((prev) =>
            prev.map((r) =>
              r.reviewId === review.reviewId
                ? { ...r, processingStatus: "completed", hasAiAnalysis: true }
                : r
            )
          );
          setActiveReprocess(null);
        } else {
          const errorData = await response.json();
          throw new Error(errorData.error || "Unknown error");
        }
      } else {
        const response = await fetch("/api/qa/process-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activityName: review.activityName,
            callId: review.callId,
            qareviewAnswers: review.qareviewAnswers,
            reviewId: review.reviewId,
            reviewedBy: review.reviewedBy,
            reviewedAt: review.edited || review.created,
            forceTranscribe: true,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.error) {
            throw new Error(result.error);
          }
          toast.success("Re-transcription completed successfully");
          await updateReviewStatus({
            reviewId: review.reviewId,
            processingStatus: "completed",
          });
          setReviews((prev) =>
            prev.map((r) =>
              r.reviewId === review.reviewId
                ? {
                    ...r,
                    processingStatus: "completed",
                    hasTranscription: result.transcription,
                    hasAiAnalysis: result.aiAnalysis,
                  }
                : r
            )
          );
          setActiveReprocess(null);
        } else {
          const errorData = await response.json();
          throw new Error(errorData.error || "Unknown error");
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Re-processing failed: ${errorMessage}`);
      await updateReviewStatus({
        reviewId: review.reviewId,
        processingStatus: "error",
      });
      setReviews((prev) =>
        prev.map((r) =>
          r.reviewId === review.reviewId
            ? { ...r, processingStatus: "error", processingError: errorMessage }
            : r
        )
      );
      setActiveReprocess(null);
    }
  };

  const getStatusIcon = (status: ProcessingStatus) => {
    switch (status) {
      case "processing":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const toggleSortByMatch = () => {
    setSortByMatch((prev) => {
      if (prev === null) return "asc";
      if (prev === "asc") return "desc";
      return null;
    });
  };

  const sortedReviews = [...reviews].sort((a, b) => {
    if (sortByMatch === null) return 0;
    const aMatch = a.matchPercentage ?? 101;
    const bMatch = b.matchPercentage ?? 101;
    return sortByMatch === "asc" ? aMatch - bMatch : bMatch - aMatch;
  });

  const completedCount = reviews.filter(
    (r) => r.processingStatus === "completed"
  ).length;
  const errorCount = reviews.filter(
    (r) => r.processingStatus === "error"
  ).length;
  // Count pending as those with activityName that are idle (not errors)
  const pendingCount = reviews.filter(
    (r) => r.processingStatus === "idle" && r.activityName
  ).length;

  const handleSaveClientReview = async (questionId: string, comment: string) => {
    if (!selectedReview?.callId) return;

    await saveClientReviewMutation({
      callId: selectedReview.callId,
      questionId,
      comment,
    });
  };

  const isInitialLoading = qaReviewsFromDB === undefined || transcriptionsFromDB === undefined;

  if (isInitialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading data from database...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            QA Comparison - Human vs AI
          </h1>
          <p className="text-sm text-muted-foreground">
            Compare QA reviews from Daktela with AI analysis
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label htmlFor="dateFrom">From Date</Label>
                <Input
                  id="dateFrom"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateTo">To Date</Label>
                <Input
                  id="dateTo"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-40"
                />
              </div>
              <Button onClick={fetchReviews} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <RefreshCw className="mr-2 h-4 w-4" />
                Fetch & Save Reviews
              </Button>
              {reviews.length > 0 && pendingCount > 0 && (
                <Button
                  onClick={processBatch}
                  disabled={batchProcessing}
                  variant="default"
                >
                  {batchProcessing && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  <Play className="mr-2 h-4 w-4" />
                  Process All ({pendingCount})
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        {reviews.length > 0 && (
          <div className="flex gap-4">
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <span className="text-sm font-medium text-green-700">
                Completed: {completedCount}
              </span>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2">
              <span className="text-sm font-medium text-gray-700">
                Pending: {pendingCount}
              </span>
            </div>
            {errorCount > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                <span className="text-sm font-medium text-red-700">
                  Errors: {errorCount}
                </span>
              </div>
            )}
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
              <span className="text-sm font-medium text-blue-700">
                Total: {reviews.length}
              </span>
            </div>
          </div>
        )}

        {/* Reviews Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">
                      Operator
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Activity
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Reviewed By
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Created
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Transcription
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      AI Analysis
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      <button
                        onClick={toggleSortByMatch}
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                      >
                        Match %
                        <ArrowUpDown className={`h-3 w-3 ${sortByMatch ? "text-primary" : "text-muted-foreground"}`} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedReviews.map((review) => (
                    <tr
                      key={review.reviewId}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        {getStatusIcon(review.processingStatus)}
                      </td>
                      <td className="px-4 py-3">
                        {review.reviewedOperator || "-"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {review.activityName
                          ? `${review.activityName.substring(0, 20)}...`
                          : "-"}
                      </td>
                      <td className="px-4 py-3">{review.reviewedBy || "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(review.created).toLocaleString("pl-PL", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        {review.hasTranscription ? (
                          <span className="flex items-center gap-1">
                            <span className="text-green-600">Yes</span>
                            <button
                              onClick={() => openTranscriptionModal(review)}
                              className="text-gray-500 hover:text-gray-700"
                              title="View transcription"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </span>
                        ) : (
                          <span className="text-gray-400">No</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {review.hasAiAnalysis ? (
                          <span className="text-green-600">Yes</span>
                        ) : (
                          <span className="text-gray-400">No</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {review.matchPercentage !== undefined ? (
                          <span
                            className={
                              review.matchPercentage >= 80
                                ? "text-green-600 font-medium"
                                : review.matchPercentage >= 60
                                  ? "text-yellow-600 font-medium"
                                  : "text-red-600 font-medium"
                            }
                          >
                            {review.matchPercentage}%
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex gap-2">
                            {review.activityName && (
                              <>
                                {!review.hasAiAnalysis && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => processReview(review)}
                                    disabled={
                                      review.processingStatus === "processing"
                                    }
                                  >
                                    {review.processingStatus === "processing" && (
                                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                    )}
                                    Process
                                  </Button>
                                )}
                                {review.hasAiAnalysis && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="default"
                                      onClick={() => openComparison(review)}
                                    >
                                      View Comparison
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => openReprocessDialog("review", review)}
                                      disabled={activeReprocess?.reviewId === review.reviewId}
                                      title="Re-run AI analysis"
                                    >
                                      {activeReprocess?.reviewId === review.reviewId && activeReprocess?.type === "review" ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <RotateCcw className="h-3 w-3" />
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => openReprocessDialog("transcribe", review)}
                                      disabled={activeReprocess?.reviewId === review.reviewId}
                                      title="Re-transcribe audio"
                                    >
                                      {activeReprocess?.reviewId === review.reviewId && activeReprocess?.type === "transcribe" ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <RefreshCw className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </>
                                )}
                              </>
                            )}
                            {!review.activityName && (
                              <span className="text-xs text-muted-foreground">
                                Missing activity
                              </span>
                            )}
                          </div>
                          {review.processingError && (
                            <span
                              className="text-xs text-red-500 max-w-[250px] truncate"
                              title={review.processingError}
                            >
                              {review.processingError}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {reviews.length === 0 && !loading && (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">
                {qaReviewsFromDB && qaReviewsFromDB.length > 0
                  ? "Loading saved reviews..."
                  : "Set date range and click \"Fetch & Save Reviews\" to get started"}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Comparison Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-7xl max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              QA Comparison - {selectedReview?.reviewedBy || "Unknown Reviewer"}
            </DialogTitle>
            <DialogDescription>
              Review ID: {selectedReview?.reviewId}
              {selectedReview?.created && (
                <span className="ml-3">
                  Created:{" "}
                  {new Date(selectedReview.created).toLocaleString("pl-PL")}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedReview && (
            <div className="mt-4">
              {(() => {
                const transcription = getTranscriptionForReview(selectedReview);
                return (
                  <QaComparison
                    aiAnalysis={transcription?.qaAnalysis}
                    humanReview={{
                      reviewId: selectedReview.reviewId,
                      activityName: selectedReview.activityName || "",
                      qareviewAnswers: selectedReview.qareviewAnswers,
                      reviewedAt:
                        selectedReview.edited || selectedReview.created,
                      reviewedBy: selectedReview.reviewedBy || undefined,
                      fetchedAt: Date.now(),
                    }}
                    activityName={selectedReview.activityName || undefined}
                    transcriptionText={transcription?.text}
                    utterances={transcription?.utterances}
                    clientReview={transcription?.clientReview}
                    onSaveClientReview={handleSaveClientReview}
                  />
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Transcription Modal */}
      <Dialog open={transcriptionModalOpen} onOpenChange={setTranscriptionModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Transcription</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[60vh] text-sm">
            {transcriptionToView?.utterances && transcriptionToView.utterances.length > 0 ? (
              <div className="space-y-4">
                {mergeConsecutiveUtterances(transcriptionToView.utterances).map((u, i) => (
                  <div key={i} className="flex gap-3">
                    <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium h-fit ${
                      u.speaker === 0 ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                    }`}>
                      Speaker {u.speaker}
                    </span>
                    <p className="text-gray-800 leading-relaxed">{u.transcript}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="whitespace-pre-wrap">{transcriptionToView?.text}</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reprocess Confirmation Dialog */}
      <AlertDialog open={reprocessDialog.open} onOpenChange={(open) => !open && closeReprocessDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {reprocessDialog.type === "review"
                ? "Re-run AI Analysis?"
                : "Re-transcribe Call?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {reprocessDialog.type === "review"
                ? "This will re-run the AI analysis using the existing transcription. The previous analysis results will be overwritten."
                : "This will re-download the audio and create a new transcription, then re-run the AI analysis. All previous results will be overwritten."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReprocess}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
