import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';

const commentarySchema = z.object({
  sessionId: z.string().uuid('Invalid session ID format').optional(),
  triggerType: z.enum(['game_over', 'master_trial_win', 'new_high_score']),
  score: z.number().int().min(0),
  wave: z.number().int().min(1),
  upgrades: z.array(z.string()),
});

// Local pre-authored fallbacks in case the Groq API fails or is unconfigured
const fallbacks = {
  game_over: [
    "Your spark is extinguished in the abyss. Stand up and embrace the discipline of shadow once more.",
    "Failure is but a shifting shadow. The void accepts your weakness, but it will not tolerate it twice.",
    "You collapsed before mere training drones. Disgraceful. True power is forged only in absolute survival.",
    "The Rule of Two demands perfection. A fallen apprentice is no apprentice at all. Rise again.",
    "You let the light training shells pierce your armor. Dark power requires absolute vigilance."
  ],
  master_trial_win: [
    "You have vanquished the master's proxy. Do not grow arrogant; the true trials have only begun.",
    "A worthy execution. The shadow inside you grows deeper. Absorb your reward and steel your mind.",
    "The weak are weeded out. You have proven yourself worthy of another tier of shadow power.",
    "The proxy shattered. Your alignment with the dark void strengthens. Choose your next blessing.",
    "A decisive victory. The master watches from the shadows, measuring your growth."
  ],
  new_high_score: [
    "You carve your mark into the black obsidian walls. You are ascending far beyond the previous apprentices.",
    "A new legacy of shadow. The master watches your rapid rise with cold interest.",
    "Such focus. The energy of the void bends entirely to your absolute will.",
    "You have surpassed the scores of the fallen. They were dust; you are becoming the shadow.",
    "A monumental stride. But remember: there can only ever be two. Keep climbing."
  ]
};

function getRandomFallback(type: 'game_over' | 'master_trial_win' | 'new_high_score'): string {
  const list = fallbacks[type];
  return list[Math.floor(Math.random() * list.length)];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parseResult = commentarySchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { sessionId, triggerType, score, wave, upgrades } = parseResult.data;

    let commentary = '';
    const groqKey = process.env.GROQ_API_KEY;

    if (groqKey) {
      try {
        // Construct system & user prompt avoiding copyrighted terms
        const systemPrompt = `You are a cold, powerful, and mysterious shadow master training a dark apprentice in a sci-fi universe. 
Your tone is dramatic, demanding, and dark. 
Generate a short 1-2 sentence commentary reacting to the apprentice's performance.
CRITICAL: Do NOT mention Star Wars, Jedi, Sith, Darth, lightsabers, the Force, Skywalker, or any copyrighted terms. Use original dark sci-fi terms (e.g. "shadow energy", "the void", "master trials", "proxies", "training drones", "the Rule of Two").
Make it sound ancient and stern.`;

        let userPrompt = '';
        if (triggerType === 'game_over') {
          userPrompt = `The apprentice died. They reached wave ${wave}, scored ${score} points, and chose these upgrades: ${upgrades.join(', ') || 'none'}. Speak to their failure.`;
        } else if (triggerType === 'master_trial_win') {
          userPrompt = `The apprentice defeated a Master Trial boss on wave ${wave}! They scored ${score} points so far. Speak to their survival.`;
        } else if (triggerType === 'new_high_score') {
          userPrompt = `The apprentice set a new personal record high score of ${score} points on wave ${wave}! Speak to their rising potential.`;
        }

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: 'openai/gpt-oss-120b',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.85,
            max_tokens: 80,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          commentary = data.choices?.[0]?.message?.content?.trim();
        } else {
          console.warn(`Groq API returned error status: ${response.status}. Using fallback.`);
          commentary = getRandomFallback(triggerType);
        }
      } catch (err) {
        console.error('Failed to query Groq API:', err);
        commentary = getRandomFallback(triggerType);
      }
    } else {
      commentary = getRandomFallback(triggerType);
    }

    // Save commentary to GameSession if sessionId is provided
    if (sessionId) {
      try {
        await prisma.gameSession.update({
          where: { id: sessionId },
          data: { commentary },
        });
      } catch (dbErr) {
        console.error('Failed to save commentary to DB:', dbErr);
      }
    }

    return NextResponse.json({ commentary });
  } catch (error) {
    console.error('Commentary route error:', error);
    return NextResponse.json(
      { error: 'An error occurred while generating commentary.' },
      { status: 500 }
    );
  }
}
