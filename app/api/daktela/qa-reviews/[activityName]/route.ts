import { NextRequest, NextResponse } from 'next/server';
import { getDaktelaToken } from '@/lib/daktela-token';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ activityName: string }> }
) {
  try {
    const { activityName } = await params;

    const daktelaUrl = process.env.DAKTELA_URL;
    if (!daktelaUrl) {
      return NextResponse.json(
        { error: 'DAKTELA_URL not configured' },
        { status: 500 }
      );
    }

    const token = await getDaktelaToken();

    const url = `${daktelaUrl}/api/v6/activities/${activityName}/qaReviews.json`;
    const response = await fetch(url, {
      headers: {
        'X-AUTH-TOKEN': token,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'No QA reviews found for this activity', qareviewAnswers: null },
          { status: 404 }
        );
      }
      throw new Error(`Daktela API error: ${response.status}`);
    }

    const data = await response.json();

    // Extract qareviewAnswers from the response
    // The structure is: result.data[0].qareviewAnswers (data is an array)
    const result = data.result;

    if (!result || !result.data || !Array.isArray(result.data) || result.data.length === 0) {
      return NextResponse.json(
        { error: 'No QA reviews found for this activity', qareviewAnswers: null },
        { status: 404 }
      );
    }

    // Get the first (most recent) review from the array
    const qaReviewData = result.data[0];

    if (!qaReviewData.qareviewAnswers) {
      return NextResponse.json(
        { error: 'No qareviewAnswers found in review', qareviewAnswers: null },
        { status: 404 }
      );
    }

    // Return the human QA review data with metadata
    return NextResponse.json({
      activityName,
      qareviewAnswers: qaReviewData.qareviewAnswers,
      reviewedAt: qaReviewData.edited || qaReviewData.created,
      reviewedBy: qaReviewData.created_by?.title || qaReviewData.created_by?.name || null,
      reviewId: qaReviewData.name,
    });

  } catch (error) {
    console.error('Error fetching QA reviews:', error);
    return NextResponse.json(
      { error: 'Failed to fetch QA reviews' },
      { status: 500 }
    );
  }
}
