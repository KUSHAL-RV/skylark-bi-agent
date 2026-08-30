import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    isMock: process.env.MONDAY_API_KEY === 'mock'
  });
}
