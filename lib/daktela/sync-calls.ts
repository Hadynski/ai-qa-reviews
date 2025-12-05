import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { getDaktelaToken } from "@/lib/daktela-token";
import type {
  DaktelaActivity,
  DaktelaActivitiesResponse,
  MappedCallRecord,
} from "@/types/daktela";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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
    agentName: callItem?.id_agent?.title ?? null,
    agentUsername: callItem?.id_agent?.name ?? null,
    agentExtension: callItem?.id_agent?.extension ?? null,
    queueId: callItem?.id_queue?.name ?? null,
    queueName: callItem?.id_queue?.title ?? null,
    contactName: activity.contact?.title ?? null,
    contactFirstname: activity.contact?.firstname ?? null,
    contactLastname: activity.contact?.lastname ?? null,
    accountName: activity.contact?.account?.title ?? null,
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
  params.append("take", "100");

  return params;
}

export interface SyncCallsResult {
  recordings: MappedCallRecord[];
  total: number;
  synced: number;
}

export async function syncCallsFromDaktela(): Promise<SyncCallsResult> {
  const token = await getDaktelaToken();
  const daktelaUrl = process.env.DAKTELA_URL?.replace(/\/+$/, "");

  if (!daktelaUrl) {
    throw new Error("DAKTELA_URL not configured");
  }

  const activeStatusIds = await convex.query(
    api.daktelaStatuses.getActiveStatusIds
  );

  if (activeStatusIds.length === 0) {
    return {
      recordings: [],
      total: 0,
      synced: 0,
    };
  }

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
    throw new Error(`Daktela API error: ${response.statusText} - ${errorBody}`);
  }

  const data: DaktelaActivitiesResponse = await response.json();
  const activities = data.result?.data ?? [];

  const mappedRecordings = activities.map(mapActivityToCallRecord);

  await convex.mutation(api.calls.syncNewCalls, {
    calls: mappedRecordings,
  });

  return {
    recordings: mappedRecordings,
    total: data.result?.total ?? 0,
    synced: mappedRecordings.length,
  };
}
