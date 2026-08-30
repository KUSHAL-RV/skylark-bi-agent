import { NextResponse } from 'next/server';
import { chatWithAgent } from '@/lib/agent';

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const response = await chatWithAgent(messages);

    return NextResponse.json({ response });
  } catch (error: any) {
    console.error('API Chat Error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred during the request.' },
      { status: 500 }
    );
  }
}
