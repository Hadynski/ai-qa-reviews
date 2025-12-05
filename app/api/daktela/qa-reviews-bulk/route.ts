import { NextRequest, NextResponse } from 'next/server';
import { getDaktelaToken } from '@/lib/daktela-token';

export interface QaReviewItem {
  reviewId: string;
  activityName: string | null;
  callId: string | null;
  qaformName: string;
  created: string;
  edited: string | null;
  reviewedBy: string | null;
  reviewedOperator: string | null;
  qareviewAnswers: Record<string, string[]>;
}

export interface QaReviewsResponse {
  reviews: QaReviewItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function GET(request: NextRequest) {
  try {
    const daktelaUrl = process.env.DAKTELA_URL;
    if (!daktelaUrl) {
      return NextResponse.json(
        { error: 'DAKTELA_URL not configured' },
        { status: 500 }
      );
    }

    const token = await getDaktelaToken();

    const { searchParams } = new URL(request.url);

    // Default parameters
    const take = searchParams.get('take') || '15';
    const skip = searchParams.get('skip') || '0';
    const page = searchParams.get('page') || '1';
    const pageSize = searchParams.get('pageSize') || '15';
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const qaformIds = searchParams.getAll('qaformId');

    // Build filter params
    const params = new URLSearchParams();
    params.append('take', take);
    params.append('skip', skip);
    params.append('page', page);
    params.append('pageSize', pageSize);
    params.append('sort[0][field]', 'created');
    params.append('sort[0][dir]', 'desc');

    let filterIndex = 0;

    // Date from filter
    if (dateFrom) {
      params.append(`filter[logic]`, 'and');
      params.append(`filter[filters][${filterIndex}][field]`, 'created');
      params.append(`filter[filters][${filterIndex}][operator]`, 'gte');
      params.append(`filter[filters][${filterIndex}][_type]`, 'date_time');
      params.append(`filter[filters][${filterIndex}][value]`, dateFrom);
      filterIndex++;
    }

    // Date to filter
    if (dateTo) {
      if (!dateFrom) params.append(`filter[logic]`, 'and');
      params.append(`filter[filters][${filterIndex}][field]`, 'created');
      params.append(`filter[filters][${filterIndex}][operator]`, 'lte');
      params.append(`filter[filters][${filterIndex}][_type]`, 'date_time');
      params.append(`filter[filters][${filterIndex}][value]`, dateTo);
      filterIndex++;
    }

    // QA form filter
    if (qaformIds.length > 0) {
      if (!dateFrom && !dateTo) params.append(`filter[logic]`, 'and');
      params.append(`filter[filters][${filterIndex}][field]`, 'qaform');
      params.append(`filter[filters][${filterIndex}][operator]`, 'in');
      qaformIds.forEach((id, idx) => {
        params.append(`filter[filters][${filterIndex}][value][${idx}]`, id);
      });
    }

    const url = `${daktelaUrl}/api/v6/qaReviews.json?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        'X-AUTH-TOKEN': token,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Daktela API error:', response.status, errorText);
      return NextResponse.json(
        { error: `Daktela API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (!data.result || !data.result.data) {
      return NextResponse.json(
        { reviews: [], total: 0, page: parseInt(page), pageSize: parseInt(pageSize) },
        { status: 200 }
      );
    }

    const reviews: QaReviewItem[] = data.result.data.map((review: any) => {
      // Use activityName as callId (this is how transcriptions are keyed)
      // Transcriptions are saved with callId = activityName
      const callId = review.activity?.name || null;

      return {
        reviewId: review.name,
        activityName: review.activity?.name || null,
        callId,
        qaformName: review.qaform?.name || review.qaform,
        created: review.created,
        edited: review.edited,
        reviewedBy: review.created_by?.title || review.created_by?.name || null,
        reviewedOperator: review.user?.title || review.user?.name || null,
        qareviewAnswers: review.qareviewAnswers || {},
      };
    });

    const result: QaReviewsResponse = {
      reviews,
      total: data.result.total || reviews.length,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    };

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error fetching QA reviews:', error);
    return NextResponse.json(
      { error: 'Failed to fetch QA reviews' },
      { status: 500 }
    );
  }
}
