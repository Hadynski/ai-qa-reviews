import { NextResponse } from 'next/server';
import { getDaktelaToken, getTokenFromCache } from '@/lib/daktela-token';

export async function POST() {
  try {
    await getDaktelaToken();
    return NextResponse.json({
      message: 'Successfully authenticated with Daktela'
    });
  } catch (error) {
    console.error('Daktela login error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const cachedToken = getTokenFromCache();
    return NextResponse.json({
      authenticated: !!cachedToken,
      message: cachedToken ? 'Token is cached and valid' : 'No valid token in cache'
    });
  } catch (error) {
    console.error('Token check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}
