import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex";
import { getDaktelaToken } from "@/lib/daktela-token";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ activityName: string }> }
) {
  try {
    const convex = getConvexClient();
    const { activityName } = await params;

    if (!activityName) {
      return NextResponse.json(
        { error: "Activity name is required" },
        { status: 400 }
      );
    }

    const token = await getDaktelaToken();
    const daktelaUrl = process.env.DAKTELA_URL?.replace(/\/+$/, '');

    if (!daktelaUrl) {
      throw new Error("DAKTELA_URL not configured");
    }

    // Get activity directly
    const activityUrl = `${daktelaUrl}/api/v6/activities/${activityName}.json`;

    const activityResponse = await fetch(activityUrl, {
      headers: {
        "X-AUTH-TOKEN": token,
        "Content-Type": "application/json",
      },
    });

    if (!activityResponse.ok) {
      throw new Error(`Daktela API error: ${activityResponse.statusText}`);
    }

    const activityData = await activityResponse.json();
    const activity = activityData.result;

    // Extract data directly from activity (which already has ticket data with contact info)
    const callRecord = {
      callId: activityName, // Use activity name as unique identifier
      activityName: activity.name || null,
      callTime: activity.ticket?.created || activity.created || new Date().toISOString(),
      duration: activity.duration || null,
      direction: null, // Not available in activity endpoint
      answered: true, // If activity exists, call was answered
      clid: null, // Not available in activity endpoint
      agentName: activity.user?.title || null,
      agentUsername: activity.user?.name || null,
      agentExtension: activity.user?.extension || null,
      queueId: null,
      queueName: null,
      contactName: activity.contact?.title || null,
      contactFirstname: activity.contact?.firstname || null,
      contactLastname: activity.contact?.lastname || null,
      accountName: activity.contact?.account?.title || null,
    };

    const result = await convex.mutation(api.calls.upsertCall, callRecord);

    return NextResponse.json({
      success: true,
      convexId: result,
      callData: callRecord,
    });
  } catch (error) {
    console.error("Add activity error:", error);
    return NextResponse.json(
      {
        error: "Failed to add call via activity",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
