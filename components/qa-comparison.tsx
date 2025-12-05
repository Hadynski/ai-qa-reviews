'use client';

import { useState, useRef } from 'react';
import { QaAnalysis, HumanQaReview, QaComparisonItem } from '@/types/qa';
import qaQuestions from '@/config/qa-questions.json';
import qaMapping from '@/config/qa-mapping.json';
import { Bot, User, Check, X, AlertTriangle, Minus, HelpCircle, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface QaComparisonProps {
  aiAnalysis?: QaAnalysis;
  humanReview?: HumanQaReview;
  activityName?: string;
  transcriptionText?: string;
}

export function calculateComparison(
  aiAnalysis?: QaAnalysis,
  humanReview?: HumanQaReview
): { items: QaComparisonItem[]; metrics: any } {
  const items: QaComparisonItem[] = [];
  let agreementCount = 0;
  let disagreementCount = 0;
  let partialCount = 0;
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

      if (aiAnswer === humanAnswer) {
        agreement = 'agree';
        agreementCount++;
      } else if (
        (aiAnswer.includes('tak') && humanAnswer.includes('tak')) ||
        (aiAnswer.includes('nie') && humanAnswer.includes('nie')) ||
        (aiAnswer.includes('częściowo') && humanAnswer.includes('częściowo'))
      ) {
        agreement = 'partial';
        partialCount++;
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
      ? Math.round(((agreementCount + partialCount) / questionsCompared) * 100)
      : 0;

  return {
    items,
    metrics: {
      totalQuestions: qaQuestions.length,
      questionsCompared,
      agreementCount,
      partialCount,
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
    case 'partial':
      return {
        label: 'Partial',
        icon: AlertTriangle,
        badgeColor: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        borderColor: 'border-yellow-200',
        bgColor: 'bg-yellow-50/30',
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

export function QaComparison({ aiAnalysis, humanReview, activityName, transcriptionText }: QaComparisonProps) {
  const { items, metrics } = calculateComparison(aiAnalysis, humanReview);
  const [hideMatches, setHideMatches] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [transcriptionModalOpen, setTranscriptionModalOpen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
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
                  style={{ width: `${(metrics.partialCount / metrics.questionsCompared) * 100}%` }}
                  className="bg-yellow-400 h-full"
                />
                <div
                  style={{ width: `${(metrics.disagreementCount / metrics.questionsCompared) * 100}%` }}
                  className="bg-red-500 h-full"
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>Total: {metrics.questionsCompared} compared</span>
                {metrics.partialCount > 0 && <span>{metrics.partialCount} Partial</span>}
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
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[1, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => handlePlaybackRateChange(rate)}
                      className={cn(
                        "px-2 py-0.5 text-xs rounded",
                        playbackRate === rate
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      )}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
                {transcriptionText && (
                  <button
                    onClick={() => setTranscriptionModalOpen(true)}
                    className="text-gray-500 hover:text-gray-700"
                    title="View transcription"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <audio
              ref={audioRef}
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
                        {item.humanAnswers.map((ans, i) => (
                          <p key={i} className="text-sm font-semibold text-gray-900">{ans}</p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No human review available</p>
                    )}
                  </div>
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
          <div className="overflow-y-auto max-h-[60vh] whitespace-pre-wrap text-sm">
            {transcriptionText}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
