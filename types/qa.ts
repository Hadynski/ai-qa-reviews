export interface QaQuestion {
  id: string;
  question: string;
  context: string;
  reference_script?: string;
  goodExamples?: string[];
  badExamples?: string[];
  possibleAnswers: string[];
}

export interface QaResult {
  questionId: string;
  question: string;
  answer: string;
  justification: string;
}

export interface QaAnalysis {
  completedAt: number;
  results: QaResult[];
}

export interface HumanQaAnswer {
  questionKey: string;
  answers: string[];
}

export interface HumanQaReview {
  reviewId: string;
  activityName: string;
  qareviewAnswers: Record<string, string[]>;
  reviewedAt?: string;
  reviewedBy?: string;
  fetchedAt: number;
}

export interface QaComparisonItem {
  questionId: string;
  question: string;
  aiAnswer?: string;
  aiJustification?: string;
  humanAnswers?: string[];
  humanQuestionKey?: string;
  agreement: 'agree' | 'disagree' | 'partial' | 'ai-only' | 'human-only';
}

export interface QaComparison {
  activityName: string;
  hasAiAnalysis: boolean;
  hasHumanReview: boolean;
  items: QaComparisonItem[];
  metrics: {
    totalQuestions: number;
    questionsCompared: number;
    agreementCount: number;
    disagreementCount: number;
    agreementPercentage: number;
  };
}

export interface ClientQuestionReview {
  questionId: string;
  comment: string;
  createdAt: number;
}

export interface ClientReview {
  reviews: ClientQuestionReview[];
  updatedAt: number;
}
