'use client';

import { useState } from 'react';
import { QaAnalysis, HumanQaReview, QaComparisonItem, ClientReview } from '@/types/qa';
import qaQuestions from '@/config/qa-questions.json';
import qaMapping from '@/config/qa-mapping.json';
import { Bot, User, Check, X, Minus, HelpCircle, ChevronDown, ChevronUp, Eye, MessageSquare, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Utterance {
  speaker: number;
  transcript: string;
  start: number;
  end: number;
}

interface QaComparisonProps {
  aiAnalysis?: QaAnalysis;
  humanReview?: HumanQaReview;
  activityName?: string;
  transcriptionText?: string;
  utterances?: Utterance[];
  clientReview?: ClientReview;
  onSaveClientReview?: (questionId: string, comment: string) => Promise<void>;
  onUpdateHumanReviewAnswer?: (questionKey: string, answer: string) => Promise<void>;
}

export function calculateComparison(
  aiAnalysis?: QaAnalysis,
  humanReview?: HumanQaReview
): { items: QaComparisonItem[]; metrics: any } {
  const items: QaComparisonItem[] = [];
  let agreementCount = 0;
  let disagreementCount = 0;
  let questionsCompared = 0;

  qaQuestions.forEach((question) => {
    const aiResult = aiAnalysis?.results.find(
      (r) => r.questionId === question.id
    );
    const humanQuestionKey = qaMapping.mappings[question.id as keyof typeof qaMapping.mappings];
    const humanAnswers = humanReview?.qareviewAnswers?.[humanQuestionKey];

    let agreement: QaComparisonItem['agreement'] = 'ai-only';

    if (aiResult && humanAnswers && humanAnswers.length > 0) {
      questionsCompared++;
      const aiAnswer = aiResult.answer.toLowerCase().trim();
      const humanAnswer = humanAnswers[0].toLowerCase().trim();

      const isPositive = (answer: string) => answer.startsWith('tak');

      if (aiAnswer === humanAnswer) {
        agreement = 'agree';
        agreementCount++;
      } else if (
        (isPositive(aiAnswer) && isPositive(humanAnswer)) ||
        (!isPositive(aiAnswer) && !isPositive(humanAnswer))
      ) {
        agreement = 'agree';
        agreementCount++;
      } else {
        agreement = 'disagree';
        disagreementCount++;
      }
    } else if (!aiResult && humanAnswers && humanAnswers.length > 0) {
      agreement = 'human-only';
    }

    items.push({
      questionId: question.id,
      question: question.question,
      aiAnswer: aiResult?.answer,
      aiJustification: aiResult?.justification,
      humanAnswers: humanAnswers,
      humanQuestionKey: humanQuestionKey,
      agreement,
    });
  });

  const agreementPercentage =
    questionsCompared > 0
      ? Math.round((agreementCount / questionsCompared) * 100)
      : 0;

  return {
    items,
    metrics: {
      totalQuestions: qaQuestions.length,
      questionsCompared,
      agreementCount,
      disagreementCount,
      agreementPercentage,
    },
  };
}

function getAgreementStyles(agreement: QaComparisonItem['agreement']) {
  switch (agreement) {
    case 'agree':
      return {
        label: 'Match',
        icon: Check,
        badgeColor: 'bg-green-100 text-green-700 border-green-200',
        borderColor: 'border-green-200',
        bgColor: 'bg-green-50/30',
      };
    case 'disagree':
      return {
        label: 'Mismatch',
        icon: X,
        badgeColor: 'bg-red-100 text-red-700 border-red-200',
        borderColor: 'border-red-200',
        bgColor: 'bg-red-50/30',
      };
    case 'ai-only':
      return {
        label: 'AI Only',
        icon: Bot,
        badgeColor: 'bg-blue-100 text-blue-700 border-blue-200',
        borderColor: 'border-blue-200',
        bgColor: 'bg-blue-50/30',
      };
    case 'human-only':
      return {
        label: 'Human Only',
        icon: User,
        badgeColor: 'bg-purple-100 text-purple-700 border-purple-200',
        borderColor: 'border-purple-200',
        bgColor: 'bg-purple-50/30',
      };
    default:
      return {
        label: 'Unknown',
        icon: HelpCircle,
        badgeColor: 'bg-gray-100 text-gray-700 border-gray-200',
        borderColor: 'border-gray-200',
        bgColor: 'bg-gray-50/30',
      };
  }
}

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

export function QaComparison({ aiAnalysis, humanReview, activityName, transcriptionText, utterances, clientReview, onSaveClientReview, onUpdateHumanReviewAnswer }: QaComparisonProps) {
  const { items, metrics } = calculateComparison(aiAnalysis, humanReview);
  const [hideMatches, setHideMatches] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [transcriptionModalOpen, setTranscriptionModalOpen] = useState(false);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});
  const [savingReviews, setSavingReviews] = useState<Set<string>>(new Set());
  const [updatingAnswers, setUpdatingAnswers] = useState<Set<string>>(new Set());

  const getExistingReview = (questionId: string) => {
    return clientReview?.reviews.find((r) => r.questionId === questionId);
  };

  const handleReviewChange = (questionId: string, value: string) => {
    setReviewDrafts((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleUpdateAnswer = async (questionKey: string, answer: string) => {
    if (!onUpdateHumanReviewAnswer) return;
    setUpdatingAnswers((prev) => new Set(prev).add(questionKey));
    try {
        await onUpdateHumanReviewAnswer(questionKey, answer);
    } catch (error) {
        console.error("Failed to update answer:", error);
    } finally {
        setUpdatingAnswers((prev) => {
            const next = new Set(prev);
            next.delete(questionKey);
            return next;
        });
    }
  };

  const handleSaveReview = async (questionId: string) => {
    if (!onSaveClientReview) return;
    const comment = reviewDrafts[questionId];
    if (comment === undefined) return;

    setSavingReviews((prev) => new Set(prev).add(questionId));
    try {
      await onSaveClientReview(questionId, comment);
      setReviewDrafts((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    } finally {
      setSavingReviews((prev) => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
    }
  };

  const toggleItem = (questionId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  };

  const filteredItems = hideMatches
    ? items.filter((item) => item.agreement !== 'agree')
    : items;

  if (!aiAnalysis && !humanReview) {
    return (
      <div className="text-center text-muted-foreground py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
        <Minus className="w-12 h-12 mx-auto text-gray-300 mb-3" />
        <p>No QA analysis or review available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Summary Section */}
      {aiAnalysis && humanReview && (
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Agreement Score</h3>
              <div className="flex items-baseline gap-2 justify-center md:justify-start">
                <span className="text-4xl font-bold text-gray-900">{metrics.agreementPercentage}%</span>
                <span className="text-sm text-gray-500">match rate</span>
              </div>
            </div>

            <div className="flex-1 w-full max-w-md space-y-2">
              <div className="flex justify-between text-xs text-gray-600 font-medium">
                <span>{metrics.agreementCount} Matches</span>
                <span>{metrics.disagreementCount} Mismatches</span>
              </div>
              <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${(metrics.agreementCount / metrics.questionsCompared) * 100}%` }}
                  className="bg-green-500 h-full"
                />
                <div
                  style={{ width: `${(metrics.disagreementCount / metrics.questionsCompared) * 100}%` }}
                  className="bg-red-500 h-full"
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>Total: {metrics.questionsCompared} compared</span>
              </div>
            </div>

            {humanReview.reviewedBy && (
              <div className="text-right hidden md:block">
                <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Reviewed By</div>
                <div className="font-medium text-gray-900 bg-gray-100 px-3 py-1 rounded-full inline-block">
                  {humanReview.reviewedBy}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Controls Section */}
      <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="hideMatches"
              checked={hideMatches}
              onCheckedChange={(checked) => setHideMatches(checked === true)}
            />
            <Label htmlFor="hideMatches" className="text-sm font-medium cursor-pointer">
              Hide matching items ({metrics.agreementCount} matches)
            </Label>
          </div>
        </div>

        {activityName && (
          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                Call Recording
              </div>
              {(transcriptionText || (utterances && utterances.length > 0)) && (
                <button
                  onClick={() => setTranscriptionModalOpen(true)}
                  className="text-gray-500 hover:text-gray-700"
                  title="View transcription"
                >
                  <Eye className="h-4 w-4" />
                </button>
              )}
            </div>
            <audio
              controls
              className="w-full h-10"
              preload="metadata"
            >
              <source src={`/api/daktela/recording/${activityName}`} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>
          </div>
        )}
      </div>

      {/* Comparison List */}
      <div className="space-y-4">
        {filteredItems.map((item) => {
          if (!item.aiAnswer && (!item.humanAnswers || item.humanAnswers.length === 0)) {
            return null;
          }

          const styles = getAgreementStyles(item.agreement);
          const Icon = styles.icon;
          const isMatch = item.agreement === 'agree';
          const isExpanded = expandedItems.has(item.questionId);
          const showDetails = !isMatch || isExpanded;

          return (
            <div
              key={item.questionId}
              className={cn(
                "rounded-xl border transition-all duration-200 hover:shadow-md",
                styles.borderColor,
                styles.bgColor
              )}
            >
              <div
                className={cn("p-5", isMatch && "cursor-pointer")}
                onClick={isMatch ? () => toggleItem(item.questionId) : undefined}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border", styles.badgeColor)}>
                        <Icon className="w-3.5 h-3.5" />
                        {styles.label}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">ID: {item.questionId}</span>
                      {isMatch && (
                        <span className="text-xs text-gray-400 ml-auto flex items-center gap-1">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                          {isExpanded ? 'Collapse' : 'Expand'}
                        </span>
                      )}
                    </div>
                    <h4 className="font-medium text-gray-900 leading-relaxed">{item.question}</h4>
                  </div>
                </div>

                {showDetails && (
                  <div className="grid md:grid-cols-2 gap-4 mt-4">
                  {/* AI Side */}
                  <div className="bg-white/60 rounded-lg p-4 border border-gray-200/60">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                      <Bot className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">AI Analysis</span>
                    </div>
                    {item.aiAnswer ? (
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-gray-900">{item.aiAnswer}</p>
                        {item.aiJustification && (
                          <div className="text-xs text-gray-600 leading-relaxed bg-gray-50 p-3 rounded border border-gray-100">
                            {item.aiJustification}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No AI answer available</p>
                    )}
                  </div>

                  {/* Human Side */}
                  <div className="bg-white/60 rounded-lg p-4 border border-gray-200/60">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                      <User className="w-4 h-4 text-purple-600" />
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Human Review</span>
                    </div>
                    {item.humanAnswers && item.humanAnswers.length > 0 ? (
                      <div className="space-y-2">
                        {onUpdateHumanReviewAnswer && item.humanQuestionKey ? (
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <Select
                                    value={item.humanAnswers[0]}
                                    onValueChange={(val) => handleUpdateAnswer(item.humanQuestionKey!, val)}
                                    disabled={updatingAnswers.has(item.humanQuestionKey!)}
                                >
                                    <SelectTrigger className="w-full h-8 bg-white border-gray-200">
                                        <SelectValue placeholder="Select answer" />
                                        {updatingAnswers.has(item.humanQuestionKey!) && <Loader2 className="h-3 w-3 animate-spin ml-2" />}
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Tak">Tak</SelectItem>
                                        <SelectItem value="Nie">Nie</SelectItem>
                                        <SelectItem value="Nie dotyczy">Nie dotyczy</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : (
                             item.humanAnswers.map((ans, i) => (
                                <p key={i} className="text-sm font-semibold text-gray-900">{ans}</p>
                             ))
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No human review available</p>
                    )}
                  </div>
                </div>
                )}

                {/* Client Review Section */}
                {onSaveClientReview && item.agreement === 'disagree' && (
                  <div className="mt-4 bg-white/60 rounded-lg p-4 border border-gray-200/60">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                      <MessageSquare className="w-4 h-4 text-orange-600" />
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Client Review</span>
                    </div>
                    {(() => {
                      const existingReview = getExistingReview(item.questionId);
                      const draft = reviewDrafts[item.questionId];
                      const currentValue = draft !== undefined ? draft : (existingReview?.comment ?? '');
                      const hasChanges = draft !== undefined && draft !== (existingReview?.comment ?? '');
                      const isSaving = savingReviews.has(item.questionId);

                      return (
                        <div className="space-y-2">
                          <textarea
                            value={currentValue}
                            onChange={(e) => handleReviewChange(item.questionId, e.target.value)}
                            placeholder="Add your feedback about this question..."
                            className="w-full text-sm p-2 border border-gray-200 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                            rows={2}
                            disabled={isSaving}
                          />
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-gray-400">
                              {existingReview && (
                                <span>
                                  Last updated: {new Date(existingReview.createdAt).toLocaleString()}
                                </span>
                              )}
                            </div>
                            {hasChanges && (
                              <button
                                onClick={() => handleSaveReview(item.questionId)}
                                disabled={isSaving}
                                className="px-3 py-1 text-xs font-medium bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 flex items-center gap-1"
                              >
                                {isSaving ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Saving...
                                  </>
                                ) : (
                                  'Save'
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Transcription Modal */}
      <Dialog open={transcriptionModalOpen} onOpenChange={setTranscriptionModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Transcription</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[60vh] text-sm">
            {utterances && utterances.length > 0 ? (
              <div className="space-y-4">
                {mergeConsecutiveUtterances(utterances).map((u, i) => (
                  <div key={i} className="flex gap-3">
                    <span className={cn(
                      "shrink-0 px-2 py-0.5 rounded text-xs font-medium h-fit",
                      u.speaker === 0 ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                    )}>
                      Speaker {u.speaker}
                    </span>
                    <p className="text-gray-800 leading-relaxed">{u.transcript}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="whitespace-pre-wrap">{transcriptionText}</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
