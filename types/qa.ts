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
