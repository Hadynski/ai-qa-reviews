import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

interface DaktelaStatus {
  name: string;
  title: string;
}

interface DaktelaAgent {
  name: string;
  title: string;
  extension?: string;
}

interface DaktelaQueue {
  name: number;
  title: string;
}

interface DaktelaContact {
  name: string;
  title: string;
  firstname?: string;
  lastname?: string;
  account?: {
    name: string;
    title: string;
  };
}

interface DaktelaCallItem {
  id_call: string;
  call_time: string;
  direction: string;
  answered: boolean;
  clid?: string;
  id_queue?: DaktelaQueue;
  id_agent?: DaktelaAgent;
}

interface DaktelaActivity {
  name: string;
  title: string;
  type: "CALL" | "EMAIL" | "CHAT" | "CUSTOM";
  action: string;
  time: string;
  duration: number;
  statuses: DaktelaStatus[];
  item?: DaktelaCallItem;
  contact?: DaktelaContact;
}

interface MappedCallRecord {
  callId: string;
  activityName: string;
  callTime: string;
  duration: number;
  direction: string | null;
  answered: boolean | null;
  clid: string | null;
  agentUsername: string | null;
  agentDisplayName: string | null;
  agentExtension: string | null;
  queueId: number | null;
  queueName: string | null;
  contactName: string | null;
  contactFirstname: string | null;
  contactLastname: string | null;
  accountName: string | null;
  statusNames: string[];
}

async function getDaktelaToken(): Promise<string> {
  const daktelaUrl = process.env.DAKTELA_URL?.replace(/\/+$/, "");
  const daktelaLogin = process.env.DAKTELA_LOGIN;
  const daktelaPassword = process.env.DAKTELA_PASSWORD;

  if (!daktelaUrl || !daktelaLogin || !daktelaPassword) {
    throw new Error("Missing Daktela credentials in environment variables");
  }

  const response = await fetch(`${daktelaUrl}/api/v6/login.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: daktelaLogin,
      password: daktelaPassword,
      only_token: 1,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.result) {
    throw new Error(`Daktela login failed: ${JSON.stringify(data.error)}`);
  }

  return data.result;
}

function mapActivityToCallRecord(activity: DaktelaActivity): MappedCallRecord {
  const callItem = activity.item;

  return {
    callId: callItem?.id_call ?? activity.name,
    activityName: activity.name,
    callTime: activity.time,
    duration: activity.duration,
    direction: callItem?.direction ?? null,
    answered: callItem?.answered ?? null,
    clid: callItem?.clid ?? null,
    agentUsername: callItem?.id_agent?.name ?? null,
    agentDisplayName: callItem?.id_agent?.title ?? null,
    agentExtension: callItem?.id_agent?.extension ?? null,
    queueId: callItem?.id_queue?.name ?? null,
    queueName: callItem?.id_queue?.title ?? null,
    contactName: activity.contact?.title ?? null,
    contactFirstname: activity.contact?.firstname ?? null,
    contactLastname: activity.contact?.lastname ?? null,
    accountName: activity.contact?.account?.title ?? null,
    statusNames: activity.statuses.map((s) => s.name),
  };
}

function buildActivitiesFilterParams(statusIds: string[]): URLSearchParams {
  const params = new URLSearchParams();

  params.append("filter[0][field]", "type");
  params.append("filter[0][operator]", "eq");
  params.append("filter[0][value]", "CALL");

  params.append("filter[1][field]", "statuses");
  params.append("filter[1][operator]", "in");
  statusIds.forEach((statusId, idx) => {
    params.append(`filter[1][value][${idx}]`, statusId);
  });

  params.append("sort[0][field]", "time");
  params.append("sort[0][dir]", "desc");
  params.append("take", "30");

  return params;
}

export const syncStatuses = internalAction({
  args: {},
  handler: async (ctx) => {
    const daktelaUrl = process.env.DAKTELA_URL?.replace(/\/+$/, "");
    if (!daktelaUrl) {
      throw new Error("DAKTELA_URL not configured");
    }

    const token = await getDaktelaToken();
    const response = await fetch(`${daktelaUrl}/api/v6/statuses.json?take=500`, {
      headers: {
        "X-AUTH-TOKEN": token,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Daktela statuses API error: ${response.statusText} - ${errorBody}`
      );
    }

    const data = await response.json();
    const statuses: Array<{ name: string; title: string }> =
      data.result?.data ?? [];

    let upserted = 0;
    for (const status of statuses) {
      await ctx.runMutation(internal.daktelaStatuses.upsertInternal, {
        statusId: status.name,
        title: status.title,
      });
      upserted++;
    }

    console.log(`Synced ${upserted} statuses from Daktela`);
    return { upserted };
  },
});

export const syncFromDaktela = internalAction({
  args: {},
  handler: async (ctx) => {
    const cronEnabled = process.env.CRON_ENABLED === "true";
    if (!cronEnabled) {
      console.log("Cron disabled, skipping sync");
      return { skipped: true, synced: 0 };
    }

    const daktelaUrl = process.env.DAKTELA_URL?.replace(/\/+$/, "");
    if (!daktelaUrl) {
      throw new Error("DAKTELA_URL not configured");
    }

    const activeStatusIds: string[] = await ctx.runQuery(
      internal.daktelaStatuses.getActiveStatusIdsInternal
    );

    if (activeStatusIds.length === 0) {
      console.log("No active statuses configured");
      return { skipped: false, synced: 0 };
    }

    const token = await getDaktelaToken();
    const filterParams = buildActivitiesFilterParams(activeStatusIds);
    const url = `${daktelaUrl}/api/v6/activities.json?${filterParams.toString()}`;

    const response = await fetch(url, {
      headers: {
        "X-AUTH-TOKEN": token,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Daktela API error: ${response.statusText} - ${errorBody}`
      );
    }

    const data = await response.json();
    const activities: DaktelaActivity[] = data.result?.data ?? [];

    const mappedRecordings = activities.map(mapActivityToCallRecord);

    const BATCH_SIZE = 20;
    for (let i = 0; i < mappedRecordings.length; i += BATCH_SIZE) {
      await ctx.runMutation(internal.syncCalls.saveCalls, {
        calls: mappedRecordings.slice(i, i + BATCH_SIZE),
      });
    }

    console.log(`Synced ${mappedRecordings.length} calls from Daktela`);

    return {
      skipped: false,
      synced: mappedRecordings.length,
      total: data.result?.total ?? 0,
    };
  },
});

export const saveCalls = internalMutation({
  args: {
    calls: v.array(
      v.object({
        callId: v.string(),
        activityName: v.string(),
        callTime: v.string(),
        duration: v.number(),
        direction: v.union(v.string(), v.null()),
        answered: v.union(v.boolean(), v.null()),
        clid: v.union(v.string(), v.null()),
        agentUsername: v.union(v.string(), v.null()),
        agentDisplayName: v.union(v.string(), v.null()),
        agentExtension: v.union(v.string(), v.null()),
        queueId: v.union(v.number(), v.null()),
        queueName: v.union(v.string(), v.null()),
        contactName: v.union(v.string(), v.null()),
        contactFirstname: v.union(v.string(), v.null()),
        contactLastname: v.union(v.string(), v.null()),
        accountName: v.union(v.string(), v.null()),
        statusNames: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const questionGroups = await ctx.db
      .query("questionGroups")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    questionGroups.sort((a, b) => a.name.localeCompare(b.name));

    for (const call of args.calls) {
      const existing = await ctx.db
        .query("calls")
        .withIndex("by_call_id", (q) => q.eq("callId", call.callId))
        .first();

      if (existing) continue;

      let agentId: Id<"agents"> | undefined;
      if (call.agentUsername) {
        const existingAgent = await ctx.db
          .query("agents")
          .withIndex("by_username", (q) => q.eq("username", call.agentUsername!))
          .first();

        if (existingAgent) {
          await ctx.db.patch(existingAgent._id, {
            displayName: call.agentDisplayName ?? call.agentUsername!,
            extension: call.agentExtension ?? null,
          });
          agentId = existingAgent._id;
        } else {
          agentId = await ctx.db.insert("agents", {
            username: call.agentUsername,
            displayName: call.agentDisplayName ?? call.agentUsername,
            extension: call.agentExtension ?? null,
            createdAt: Date.now(),
          });
        }
      }

      const shouldSkip =
        call.answered === false || (call.duration !== null && call.duration < 30);

      if (shouldSkip) {
        await ctx.db.insert("calls", {
          callId: call.callId,
          activityName: call.activityName,
          callTime: call.callTime,
          duration: call.duration,
          direction: call.direction,
          answered: call.answered,
          clid: call.clid,
          agentId,
          queueId: call.queueId,
          queueName: call.queueName,
          contactName: call.contactName,
          contactFirstname: call.contactFirstname,
          contactLastname: call.contactLastname,
          accountName: call.accountName,
          processingStatus: "skipped",
          createdAt: Date.now(),
        });
        continue;
      }

      let matchedGroupId: Id<"questionGroups"> | undefined;
      for (const group of questionGroups) {
        const hasMatchingStatus = call.statusNames.some((sn) =>
          group.statusIds.includes(sn)
        );
        if (hasMatchingStatus) {
          matchedGroupId = group._id;
          break;
        }
      }

      await ctx.db.insert("calls", {
        callId: call.callId,
        activityName: call.activityName,
        callTime: call.callTime,
        duration: call.duration,
        direction: call.direction,
        answered: call.answered,
        clid: call.clid,
        agentId,
        queueId: call.queueId,
        queueName: call.queueName,
        contactName: call.contactName,
        contactFirstname: call.contactFirstname,
        contactLastname: call.contactLastname,
        accountName: call.accountName,
        processingStatus: matchedGroupId ? "synced" : "skipped",
        questionGroupId: matchedGroupId,
        createdAt: Date.now(),
      });
    }
  },
});
