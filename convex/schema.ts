import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  questionGroups: defineTable({
    name: v.string(),
    displayName: v.string(),
    systemPrompt: v.string(),
    isActive: v.boolean(),
    statusIds: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active", ["isActive"])
    .index("by_name", ["name"]),

  questions: defineTable({
    groupId: v.id("questionGroups"),
    questionId: v.string(),
    question: v.string(),
    context: v.string(),
    referenceScript: v.optional(v.string()),
    goodExamples: v.optional(v.array(v.string())),
    badExamples: v.optional(v.array(v.string())),
    possibleAnswers: v.array(v.string()),
    sortOrder: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_group_active", ["groupId", "isActive", "sortOrder"])
    .index("by_question_id", ["questionId"]),

  calls: defineTable({
    callId: v.string(),
    activityName: v.string(),
    callTime: v.string(),
    duration: v.union(v.number(), v.null()),
    direction: v.union(v.string(), v.null()),
    answered: v.union(v.boolean(), v.null()),
    clid: v.union(v.string(), v.null()),
    agentId: v.optional(v.id("agents")),
    queueId: v.union(v.number(), v.null()),
    queueName: v.union(v.string(), v.null()),
    contactName: v.union(v.string(), v.null()),
    contactFirstname: v.union(v.string(), v.null()),
    contactLastname: v.union(v.string(), v.null()),
    accountName: v.union(v.string(), v.null()),
    processingStatus: v.string(),
    processingError: v.optional(v.string()),
    questionGroupId: v.optional(v.id("questionGroups")),
    qaScore: v.optional(v.number()),
    retryCount: v.optional(v.number()),
    lastProcessedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_call_id", ["callId"])
    .index("by_call_time", ["callTime"])
    .index("by_processing_status", ["processingStatus"])
    .index("by_agent", ["agentId"])
    .index("by_agent_and_group", ["agentId", "questionGroupId"]),

  transcriptions: defineTable({
    callId: v.string(),
    text: v.string(),
    languageCode: v.string(),
    utterances: v.optional(
      v.array(
        v.object({
          speaker: v.number(),
          transcript: v.string(),
          start: v.number(),
          end: v.number(),
        })
      )
    ),
    qaAnalysis: v.optional(
      v.object({
        completedAt: v.number(),
        results: v.array(
          v.object({
            questionId: v.string(),
            question: v.string(),
            answer: v.string(),
            justification: v.string(),
          })
        ),
      })
    ),
    createdAt: v.number(),
  }).index("by_call_id", ["callId"]),

  agents: defineTable({
    username: v.string(),
    displayName: v.string(),
    extension: v.union(v.string(), v.null()),
    createdAt: v.number(),
  })
    .index("by_username", ["username"]),

  daktelaStatuses: defineTable({
    statusId: v.string(),
    title: v.string(),
    isActiveForQa: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_status_id", ["statusId"])
    .index("by_active", ["isActiveForQa"]),

  callStats: defineTable({
    agentId: v.id("agents"),
    questionGroupId: v.id("questionGroups"),
    analyzedCount: v.number(),
    totalScore: v.number(),
    totalDuration: v.number(),
    lastUpdatedAt: v.number(),
  })
    .index("by_agent", ["agentId"])
    .index("by_group", ["questionGroupId"])
    .index("by_agent_and_group", ["agentId", "questionGroupId"]),

  questionStats: defineTable({
    questionId: v.string(),
    groupId: v.id("questionGroups"),
    takCount: v.number(),
    nieCount: v.number(),
    totalCount: v.number(),
    lastUpdatedAt: v.number(),
  })
    .index("by_question", ["questionId"])
    .index("by_group", ["groupId"]),

  settings: defineTable({
    key: v.string(),
    value: v.any(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  promptFeedback: defineTable({
    questionId: v.string(),
    callId: v.string(),
    callDocId: v.id("calls"),
    authorId: v.string(),
    authorName: v.string(),
    aiAnswer: v.string(),
    reviewerAnswer: v.optional(v.string()),
    comment: v.string(),
    status: v.string(),
    resolvedBy: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_question_status", ["questionId", "status"])
    .index("by_call", ["callId"]),

});
