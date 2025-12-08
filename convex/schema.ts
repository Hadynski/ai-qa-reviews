import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  calls: defineTable({
    callId: v.string(),
    activityName: v.string(),
    callTime: v.string(),
    duration: v.union(v.number(), v.null()),
    direction: v.union(v.string(), v.null()),
    answered: v.union(v.boolean(), v.null()),
    clid: v.union(v.string(), v.null()),
    agentName: v.union(v.string(), v.null()),
    agentUsername: v.union(v.string(), v.null()),
    agentExtension: v.union(v.string(), v.null()),
    queueId: v.union(v.number(), v.null()),
    queueName: v.union(v.string(), v.null()),
    contactName: v.union(v.string(), v.null()),
    contactFirstname: v.union(v.string(), v.null()),
    contactLastname: v.union(v.string(), v.null()),
    accountName: v.union(v.string(), v.null()),
    createdAt: v.number(),
  })
    .index("by_call_id", ["callId"])
    .index("by_call_time", ["callTime"]),

  transcriptions: defineTable({
    callId: v.string(),
    text: v.string(),
    languageCode: v.string(),
    words: v.optional(
      v.array(
        v.object({
          text: v.string(),
          start: v.number(),
          end: v.number(),
          type: v.string(),
          speaker_id: v.optional(v.string()),
          logprob: v.optional(v.number()),
          characters: v.optional(v.array(v.any())),
        })
      )
    ),
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
    humanQaReview: v.optional(
      v.object({
        reviewId: v.string(),
        activityName: v.string(),
        qareviewAnswers: v.any(),
        reviewedAt: v.optional(v.string()),
        reviewedBy: v.optional(v.string()),
        fetchedAt: v.number(),
      })
    ),
    clientReview: v.optional(
      v.object({
        reviews: v.array(
          v.object({
            questionId: v.string(),
            comment: v.string(),
            createdAt: v.number(),
          })
        ),
        updatedAt: v.number(),
      })
    ),
    createdAt: v.number(),
  }).index("by_call_id", ["callId"]),

  daktelaStatuses: defineTable({
    statusId: v.string(),
    name: v.string(),
    title: v.string(),
    isActiveForQa: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_status_id", ["statusId"])
    .index("by_name", ["name"])
    .index("by_active", ["isActiveForQa"]),

  qaReviews: defineTable({
    reviewId: v.string(),
    activityName: v.union(v.string(), v.null()),
    callId: v.union(v.string(), v.null()),
    qaformName: v.string(),
    created: v.string(),
    edited: v.union(v.string(), v.null()),
    reviewedBy: v.union(v.string(), v.null()),
    reviewedOperator: v.optional(v.union(v.string(), v.null())),
    qareviewAnswers: v.any(),
    processingStatus: v.string(),
    fetchedAt: v.number(),
  })
    .index("by_review_id", ["reviewId"])
    .index("by_call_id", ["callId"])
    .index("by_created", ["created"]),
});
