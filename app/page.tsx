"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, PhoneIncoming, PhoneOutgoing, User, Clock, AlertCircle } from "lucide-react";
import { QaComparison } from "@/components/qa-comparison";
import { HumanQaReview } from "@/types/qa";
import { toast } from "sonner";

type TranscriptionWord = {
  text: string;
  start: number;
  end: number;
  type: string;
  speaker_id: string | null;
};

type Transcription = {
  text: string;
  words: TranscriptionWord[];
  language_code: string;
};

type QaResult = {
  questionId: string;
  question: string;
  answer: string;
  justification: string;
};

type QaAnalysis = {
  completedAt: number;
  results: QaResult[];
};

type Recording = {
  callId: string;
  activityName: string | null;
  duration?: number;
  callTime?: string;
  direction?: "in" | "out";
  answered?: boolean;
  clid?: string;
  agentName?: string | null;
  agentUsername?: string | null;
  agentExtension?: string | null;
  queueId?: number | null;
  queueName?: string | null;
  contactName?: string | null;
  contactFirstname?: string | null;
  contactLastname?: string | null;
  accountName?: string | null;
  transcription?: Transcription;
  transcriptionStatus?: 'idle' | 'loading' | 'completed' | 'error';
  qaAnalysis?: QaAnalysis;
  qaAnalysisStatus?: 'idle' | 'loading' | 'completed' | 'error';
  humanQaReview?: HumanQaReview;
  humanQaReviewStatus?: 'idle' | 'loading' | 'completed' | 'error';
};

export default function Home() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [addActivityDialogOpen, setAddActivityDialogOpen] = useState(false);
  const [activityInput, setActivityInput] = useState("");
  const [addActivityLoading, setAddActivityLoading] = useState(false);
  const [addActivityError, setAddActivityError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  // Helper function to format contact name from firstname and lastname
  const formatContactName = (firstname?: string | null, lastname?: string | null): string => {
    const parts = [firstname, lastname].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : '-';
  };

  // Load calls and transcriptions from Convex
  const callsData = useQuery(api.calls.list, { page: currentPage, limit: 20 });
  const transcriptionsFromDB = useQuery(api.transcriptions.list);

  // Convex mutation for saving human QA review
  const saveHumanQaReview = useMutation(api.transcriptions.saveHumanQaReview);

  useEffect(() => {
    const authenticateDaktela = async () => {
      try {
        const response = await fetch('/api/daktela/login', {
          method: 'POST'
        });

        if (response.ok) {
          setAuthStatus('authenticated');
        } else {
          const data = await response.json();
          console.error('Authentication failed:', data.error);
          setAuthStatus('unauthenticated');
        }
      } catch (error) {
        console.error('Authentication failed:', error);
        setAuthStatus('unauthenticated');
      }
    };

    authenticateDaktela();
  }, []);

  // Load recordings from cache on mount
  useEffect(() => {
    if (callsData?.calls && transcriptionsFromDB) {
      const recordingsWithTranscriptions = callsData.calls.map(call => {
        const transcription = transcriptionsFromDB.find(t => t.callId === call.callId);
        return {
          ...call,
          transcription: transcription
            ? {
                text: transcription.text,
                language_code: transcription.languageCode,
                words: transcription.words || [],
              }
            : undefined,
          transcriptionStatus: transcription ? ('completed' as const) : ('idle' as const),
          qaAnalysis: transcription?.qaAnalysis,
          qaAnalysisStatus: transcription?.qaAnalysis ? ('completed' as const) : ('idle' as const),
          humanQaReview: transcription?.humanQaReview,
          humanQaReviewStatus: transcription?.humanQaReview ? ('completed' as const) : ('idle' as const),
        };
      });
      setRecordings(recordingsWithTranscriptions as Recording[]);
    }
  }, [callsData, transcriptionsFromDB]);

  const loadRecordings = async () => {
    setLoading(true);
    try {
      // First, show what we have in Convex
      if (callsData?.calls && transcriptionsFromDB) {
        const recordingsWithTranscriptions = callsData.calls.map(call => {
          const transcription = transcriptionsFromDB.find(t => t.callId === call.callId);
          return {
            ...call,
            transcription: transcription
              ? {
                  text: transcription.text,
                  language_code: transcription.languageCode,
                  words: transcription.words || [],
                }
              : undefined,
            transcriptionStatus: transcription ? ('completed' as const) : ('idle' as const),
            qaAnalysis: transcription?.qaAnalysis,
            qaAnalysisStatus: transcription?.qaAnalysis ? ('completed' as const) : ('idle' as const),
            humanQaReview: transcription?.humanQaReview,
            humanQaReviewStatus: transcription?.humanQaReview ? ('completed' as const) : ('idle' as const),
          };
        });
        setRecordings(recordingsWithTranscriptions as Recording[]);
      }

      // Then, fetch new from Daktela (this will also sync to Convex)
      const response = await fetch('/api/daktela/recordings');

      if (response.ok) {
        const data = await response.json();

        // Merge with transcriptions from DB
        const recordingsWithStatus = data.recordings.map((r: Recording) => {
          const transcription = transcriptionsFromDB?.find(t => t.callId === r.callId);
          return {
            ...r,
            transcription: transcription
              ? {
                  text: transcription.text,
                  language_code: transcription.languageCode,
                  words: transcription.words || [],
                }
              : undefined,
            transcriptionStatus: transcription ? ('completed' as const) : ('idle' as const),
            qaAnalysis: transcription?.qaAnalysis,
            qaAnalysisStatus: transcription?.qaAnalysis ? ('completed' as const) : ('idle' as const),
            humanQaReview: transcription?.humanQaReview,
            humanQaReviewStatus: transcription?.humanQaReview ? ('completed' as const) : ('idle' as const),
          };
        });

        setRecordings(recordingsWithStatus);
      } else {
        const errorData = await response.json();
        console.error("Failed to load recordings:", errorData.error);
      }
    } catch (error) {
      console.error("Failed to load recordings:", error);
    } finally {
      setLoading(false);
    }
  };

  const addActivityManually = async () => {
    if (!activityInput.trim()) {
      setAddActivityError("Please enter an activity ID");
      return;
    }

    setAddActivityLoading(true);
    setAddActivityError(null);

    try {
      const response = await fetch(`/api/daktela/add-activity/${activityInput.trim()}`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        console.log("Activity added successfully:", data);

        // Close dialog and reset
        setAddActivityDialogOpen(false);
        setActivityInput("");

        // Refresh recordings list to show the newly added activity
        if (callsData?.calls && transcriptionsFromDB) {
          const recordingsWithTranscriptions = callsData.calls.map(call => {
            const transcription = transcriptionsFromDB.find(t => t.callId === call.callId);
            return {
              ...call,
              transcription: transcription
                ? {
                    text: transcription.text,
                    language_code: transcription.languageCode,
                    words: transcription.words || [],
                  }
                : undefined,
              transcriptionStatus: transcription ? ('completed' as const) : ('idle' as const),
              qaAnalysis: transcription?.qaAnalysis,
              qaAnalysisStatus: transcription?.qaAnalysis ? ('completed' as const) : ('idle' as const),
              humanQaReview: transcription?.humanQaReview,
              humanQaReviewStatus: transcription?.humanQaReview ? ('completed' as const) : ('idle' as const),
            };
          });
          setRecordings(recordingsWithTranscriptions as Recording[]);
        }
      } else {
        const errorData = await response.json();
        setAddActivityError(errorData.error || "Failed to add activity");
      }
    } catch (error) {
      console.error("Failed to add activity:", error);
      setAddActivityError(error instanceof Error ? error.message : "Failed to add activity");
    } finally {
      setAddActivityLoading(false);
    }
  };

  const transcribeRecording = async (callId: string, activityName: string) => {
    setRecordings(prev => prev.map(r =>
      r.callId === callId
        ? { ...r, transcriptionStatus: 'loading' as const }
        : r
    ));

    try {
      const response = await fetch(
        `/api/daktela/transcribe/${activityName}?callId=${callId}`,
        {
          method: 'POST',
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRecordings(prev => prev.map(r =>
          r.callId === callId
            ? {
                ...r,
                transcription: data.transcription,
                transcriptionStatus: 'completed' as const
              }
            : r
        ));
      } else {
        const errorData = await response.json();
        console.error("Transcription failed:", errorData);
        toast.error(errorData.error || "Transcription failed");
        setRecordings(prev => prev.map(r =>
          r.callId === callId
            ? { ...r, transcriptionStatus: 'error' as const }
            : r
        ));
      }
    } catch (error) {
      console.error("Transcription failed:", error);
      toast.error("Transcription failed - network error");
      setRecordings(prev => prev.map(r =>
        r.callId === callId
          ? { ...r, transcriptionStatus: 'error' as const }
          : r
      ));
    }
  };

  const handleTranscribeOrView = (recording: Recording) => {
    if (recording.transcriptionStatus === 'completed' && recording.transcription) {
      // Show the modal
      setSelectedRecording(recording);
      setModalOpen(true);

      // Auto-fetch human QA if we have AI analysis but no human review yet
      if (
        recording.qaAnalysisStatus === 'completed' &&
        recording.humanQaReviewStatus !== 'completed' &&
        recording.humanQaReviewStatus !== 'loading' &&
        recording.activityName
      ) {
        fetchHumanQaReview(recording.callId, recording.activityName);
      }
    } else {
      // Trigger transcription
      if (recording.activityName) {
        transcribeRecording(recording.callId, recording.activityName);
      }
    }
  };

  const analyzeQa = async (callId: string) => {
    setRecordings(prev => prev.map(r =>
      r.callId === callId
        ? { ...r, qaAnalysisStatus: 'loading' as const }
        : r
    ));

    try {
      const response = await fetch('/api/qa/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ callId }),
      });

      if (response.ok) {
        const data = await response.json();
        setRecordings(prev => prev.map(r =>
          r.callId === callId
            ? {
                ...r,
                qaAnalysis: {
                  completedAt: Date.now(),
                  results: data.results
                },
                qaAnalysisStatus: 'completed' as const
              }
            : r
        ));
      } else {
        const errorData = await response.json();
        console.error("QA analysis failed:", errorData.error);
        setRecordings(prev => prev.map(r =>
          r.callId === callId
            ? { ...r, qaAnalysisStatus: 'error' as const }
            : r
        ));
      }
    } catch (error) {
      console.error("QA analysis failed:", error);
      setRecordings(prev => prev.map(r =>
        r.callId === callId
          ? { ...r, qaAnalysisStatus: 'error' as const }
          : r
      ));
    }
  };

  const handleQaAnalyzeOrView = (recording: Recording) => {
    if (recording.qaAnalysisStatus === 'completed' && recording.qaAnalysis) {
      // Show QA results in modal
      setSelectedRecording(recording);
      setModalOpen(true);

      // Auto-fetch human QA if not already fetched
      if (
        recording.humanQaReviewStatus !== 'completed' &&
        recording.humanQaReviewStatus !== 'loading' &&
        recording.activityName
      ) {
        fetchHumanQaReview(recording.callId, recording.activityName);
      }
    } else {
      // Trigger QA analysis
      analyzeQa(recording.callId);
    }
  };

  const fetchHumanQaReview = async (callId: string, activityName: string) => {
    setRecordings(prev => prev.map(r =>
      r.callId === callId
        ? { ...r, humanQaReviewStatus: 'loading' as const }
        : r
    ));

    if (selectedRecording?.callId === callId) {
      setSelectedRecording(prev => prev ? { ...prev, humanQaReviewStatus: 'loading' as const } : null);
    }

    try {
      const response = await fetch(`/api/daktela/qa-reviews/${activityName}`);

      if (response.ok) {
        const data = await response.json();

        const humanQaReview: HumanQaReview = {
          reviewId: data.reviewId,
          activityName: data.activityName,
          qareviewAnswers: data.qareviewAnswers,
          reviewedAt: data.reviewedAt,
          reviewedBy: data.reviewedBy,
          fetchedAt: Date.now(),
        };

        // Save to Convex
        await saveHumanQaReview({
          callId,
          humanQaReview,
        });

        setRecordings(prev => prev.map(r =>
          r.callId === callId
            ? {
                ...r,
                humanQaReview,
                humanQaReviewStatus: 'completed' as const
              }
            : r
        ));

        // Update selected recording if it's currently open in modal
        if (selectedRecording?.callId === callId) {
          setSelectedRecording(prev => prev ? { ...prev, humanQaReview, humanQaReviewStatus: 'completed' as const } : null);
        }
      } else {
        const errorData = await response.json();
        console.error("Failed to fetch human QA review:", errorData.error);
        setRecordings(prev => prev.map(r =>
          r.callId === callId
            ? { ...r, humanQaReviewStatus: 'error' as const }
            : r
        ));
        if (selectedRecording?.callId === callId) {
          setSelectedRecording(prev => prev ? { ...prev, humanQaReviewStatus: 'error' as const } : null);
        }
      }
    } catch (error) {
      console.error("Failed to fetch human QA review:", error);
      setRecordings(prev => prev.map(r =>
        r.callId === callId
          ? { ...r, humanQaReviewStatus: 'error' as const }
          : r
      ));
      if (selectedRecording?.callId === callId) {
        setSelectedRecording(prev => prev ? { ...prev, humanQaReviewStatus: 'error' as const } : null);
      }
    }
  };


  return (
    <div className="min-h-screen p-8">
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Call Activities
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage and analyze your call recordings
              </p>
            </div>
            {authStatus === 'authenticated' && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <div className="h-2 w-2 rounded-full bg-green-600"></div>
                Connected to Daktela
              </div>
            )}
            {authStatus === 'unauthenticated' && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                Authentication failed
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 items-center">
          <Button
            onClick={loadRecordings}
            disabled={loading || authStatus !== 'authenticated'}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? "Loading" : "Load Call Activities"}
          </Button>
          <Button
            onClick={() => setAddActivityDialogOpen(true)}
            disabled={authStatus !== 'authenticated'}
            variant="outline"
          >
            Add Activity by ID
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Contact</th>
                    <th className="px-4 py-3 text-left font-medium">Phone</th>
                    <th className="px-4 py-3 text-left font-medium">Time</th>
                    <th className="px-4 py-3 text-left font-medium">Agent</th>
                    <th className="px-4 py-3 text-left font-medium">Queue</th>
                    <th className="px-4 py-3 text-left font-medium">Duration</th>
                    <th className="px-4 py-3 text-left font-medium">Recording</th>
                    <th className="px-4 py-3 text-left font-medium">Transcribe</th>
                    <th className="px-4 py-3 text-left font-medium">QA Analysis</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recordings.map((recording) => (
                    <tr key={recording.callId} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {recording.direction === 'in' ? (
                            <PhoneIncoming className="h-4 w-4 text-green-600" />
                          ) : recording.direction === 'out' ? (
                            <PhoneOutgoing className="h-4 w-4 text-blue-600" />
                          ) : (
                            <Clock className="h-4 w-4 text-gray-400" />
                          )}
                          {recording.answered ? (
                            <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                          ) : (
                            <span className="inline-block w-2 h-2 rounded-full bg-red-500"></span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {formatContactName(recording.contactFirstname, recording.contactLastname)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {recording.clid || '-'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {recording.callTime ? new Date(recording.callTime).toLocaleString('pl-PL', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {recording.agentName ? (
                            <>
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="truncate max-w-[150px]">{recording.agentName}</span>
                              {recording.agentExtension && (
                                <span className="text-xs text-muted-foreground">({recording.agentExtension})</span>
                              )}
                            </>
                          ) : '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">
                        {recording.queueName || '-'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {recording.duration && recording.duration > 0
                          ? `${Math.floor(recording.duration / 60)}:${String(recording.duration % 60).padStart(2, '0')}`
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        {recording.activityName ? (
                          <audio
                            controls
                            preload="none"
                            className="h-8"
                            src={`/api/daktela/recording/${recording.activityName}`}
                          >
                            Your browser does not support the audio element.
                          </audio>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {recording.activityName && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTranscribeOrView(recording)}
                            disabled={recording.transcriptionStatus === 'loading'}
                          >
                            {recording.transcriptionStatus === 'loading' && (
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            )}
                            {recording.transcriptionStatus === 'completed' ? 'View' : 'Transcribe'}
                          </Button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {recording.transcriptionStatus === 'completed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleQaAnalyzeOrView(recording)}
                            disabled={recording.qaAnalysisStatus === 'loading'}
                          >
                            {recording.qaAnalysisStatus === 'loading' && (
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            )}
                            {recording.qaAnalysisStatus === 'completed' ? 'View QA' : 'Analyze'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {callsData && callsData.total > 0 && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {recordings.length} of {callsData.total} call activities
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage + 1} of {callsData.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={currentPage >= callsData.totalPages - 1}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {recordings.length === 0 && !loading && (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">
                Click "Load Call Activities" to get started
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-7xl max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Call Details - {selectedRecording ? (formatContactName(selectedRecording.contactFirstname, selectedRecording.contactLastname) !== '-' ? formatContactName(selectedRecording.contactFirstname, selectedRecording.contactLastname) : selectedRecording.clid || 'Unknown') : 'Unknown'}
            </DialogTitle>
            <DialogDescription>
              {selectedRecording?.callTime && new Date(selectedRecording.callTime).toLocaleString('pl-PL')}
              {selectedRecording?.transcription && (
                <span className="ml-3 text-xs">
                  Language: {selectedRecording.transcription.language_code.toUpperCase()}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {(selectedRecording?.qaAnalysis || selectedRecording?.humanQaReview) && (
            <div className="mt-4">
              {selectedRecording.humanQaReviewStatus === 'loading' && (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading human QA review...
                </div>
              )}
              <QaComparison
                aiAnalysis={selectedRecording.qaAnalysis}
                humanReview={selectedRecording.humanQaReview}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addActivityDialogOpen} onOpenChange={setAddActivityDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Activity by ID</DialogTitle>
            <DialogDescription>
              Enter the activity ID (e.g., activity_692077b476f62169894325) to manually add it to the list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Input
                placeholder="activity_692077b476f62169894325"
                value={activityInput}
                onChange={(e) => setActivityInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !addActivityLoading) {
                    addActivityManually();
                  }
                }}
                disabled={addActivityLoading}
              />
              {addActivityError && (
                <p className="text-sm text-red-600">{addActivityError}</p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setAddActivityDialogOpen(false);
                  setActivityInput("");
                  setAddActivityError(null);
                }}
                disabled={addActivityLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={addActivityManually}
                disabled={addActivityLoading || !activityInput.trim()}
              >
                {addActivityLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {addActivityLoading ? "Adding..." : "Add Activity"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
