import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';

// Zod schema for saving a score session
const scoreSaveSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  score: z.number().int().min(0, 'Score must be non-negative'),
  waveReached: z.number().int().min(1, 'Wave reached must be at least 1'),
  selectedUpgrades: z.array(z.string()),
  result: z.enum(['WIN', 'LOSS']),
});

// GET: Fetch top high scores for leaderboard
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);
    const usernameQuery = url.searchParams.get('username') || '';

    const highScores = await prisma.highScore.findMany({
      where: usernameQuery
        ? {
            user: {
              username: {
                contains: usernameQuery,
                mode: 'insensitive',
              },
            },
          }
        : {},
      orderBy: {
        score: 'desc',
      },
      take: limit,
      include: {
        user: {
          select: {
            username: true,
          },
        },
      },
    });

    return NextResponse.json({ highScores });
  } catch (error) {
    console.error('Fetch scores error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve high scores.' },
      { status: 500 }
    );
  }
}

// POST: Save a game session and update high score
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parseResult = scoreSaveSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { userId, score, waveReached, selectedUpgrades, result } = parseResult.data;

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    }

    // Save GameSession
    const session = await prisma.gameSession.create({
      data: {
        userId,
        score,
        waveReached,
        selectedUpgrades,
        result,
      },
    });

    // Check if new personal high score
    const currentHighScore = await prisma.highScore.findFirst({
      where: { userId },
      orderBy: { score: 'desc' },
    });

    let isNewRecord = false;
    if (!currentHighScore || score > currentHighScore.score) {
      isNewRecord = true;
      await prisma.highScore.create({
        data: {
          userId,
          score,
          waveReached,
        },
      });
    }

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      isNewRecord,
    });
  } catch (error) {
    console.error('Save score error:', error);
    return NextResponse.json(
      { error: 'Failed to save game session.' },
      { status: 500 }
    );
  }
}
