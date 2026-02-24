import { createAccessControl } from "better-auth/plugins/access";

export const statement = {
  dashboard: ["view"],
  calls: ["view", "retry", "reprocess", "delete"],
  transcriptions: ["view", "edit", "delete"],
  questionGroups: ["view", "create", "update", "delete"],
  questions: ["view", "create", "update", "delete", "reorder"],
  statuses: ["view", "update"],
  users: ["manage"],
  promptFeedback: ["view", "create", "resolve"],
} as const;

export const ac = createAccessControl(statement);

export const userRole = ac.newRole({
  dashboard: ["view"],
  calls: ["view"],
  transcriptions: ["view"],
  questionGroups: ["view"],
  questions: ["view"],
  statuses: ["view"],
  promptFeedback: ["view"],
});

export const reviewerRole = ac.newRole({
  dashboard: ["view"],
  calls: ["view", "retry", "reprocess"],
  transcriptions: ["view", "edit"],
  questionGroups: ["view"],
  questions: ["view"],
  statuses: ["view"],
  promptFeedback: ["view", "create"],
});

export const adminRole = ac.newRole({
  dashboard: ["view"],
  calls: ["view", "retry", "reprocess", "delete"],
  transcriptions: ["view", "edit", "delete"],
  questionGroups: ["view", "create", "update", "delete"],
  questions: ["view", "create", "update", "delete", "reorder"],
  statuses: ["view", "update"],
  users: ["manage"],
  promptFeedback: ["view", "create", "resolve"],
});
