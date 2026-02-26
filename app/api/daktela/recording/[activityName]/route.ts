import { NextRequest, NextResponse } from "next/server";
import { getDaktelaToken } from "@/lib/daktela-token";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ activityName: string }> }
) {
  try {
    const token = await getDaktelaToken();
    const daktelaUrl = process.env.DAKTELA_URL?.replace(/\/+$/, "");

    if (!daktelaUrl) {
      throw new Error("DAKTELA_URL not configured");
    }

    const { activityName } = await params;

    if (!activityName) {
      return NextResponse.json(
        { error: "Activity name is required" },
        { status: 400 }
      );
    }

    const url = `${daktelaUrl}/file/recording/${activityName}?accessToken=${token}`;

    const response = await fetch(url, {
      headers: { Accept: "audio/*" },
    });

    if (!response.ok) {
      throw new Error(`Daktela API error: ${response.statusText}`);
    }

    const audioData = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "audio/mpeg";
    const totalSize = audioData.byteLength;

    const rangeHeader = request.headers.get("range");

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);

      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
        const chunkSize = end - start + 1;
        const chunk = audioData.slice(start, end + 1);

        return new NextResponse(chunk, {
          status: 206,
          headers: {
            "Content-Type": contentType,
            "Content-Length": chunkSize.toString(),
            "Content-Range": `bytes ${start}-${end}/${totalSize}`,
            "Accept-Ranges": "bytes",
          },
        });
      }
    }

    return new NextResponse(audioData, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": totalSize.toString(),
        "Accept-Ranges": "bytes",
        "Content-Disposition": `inline; filename="${activityName}.mp3"`,
      },
    });
  } catch (error) {
    console.error("Daktela recording error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch recording from Daktela",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
