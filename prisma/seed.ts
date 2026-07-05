import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');
  // Clean database
  await prisma.highScore.deleteMany();
  await prisma.gameSession.deleteMany();
  await prisma.user.deleteMany();

  // Create users
  const user1 = await prisma.user.create({
    data: {
      username: 'ShadowMaster',
    },
  });

  const user2 = await prisma.user.create({
    data: {
      username: 'AcolyteVoid',
    },
  });

  const user3 = await prisma.user.create({
    data: {
      username: 'DarkSeeker',
    },
  });

  // Create sessions and high scores
  await prisma.gameSession.createMany({
    data: [
      {
        userId: user1.id,
        score: 12500,
        waveReached: 12,
        selectedUpgrades: ['Stronger Lightning', 'Wider Void Push', 'Faster Energy Regen'],
        result: 'LOSS',
        commentary: 'Your lightning flickered, but the dark void consumed your enemies. A worthy trial.',
      },
      {
        userId: user2.id,
        score: 8500,
        waveReached: 8,
        selectedUpgrades: ['Shorter Leap Cooldown', 'More Health'],
        result: 'LOSS',
        commentary: 'You fled with leaps, but in the end, shadows cannot outrun destiny.',
      },
      {
        userId: user3.id,
        score: 15000,
        waveReached: 15,
        selectedUpgrades: ['Stronger Lightning', 'Wider Void Push', 'Faster Energy Regen', 'More Health'],
        result: 'LOSS',
        commentary: 'A master has risen. You have triumphed over the trials of shadow.',
      },
    ],
  });

  await prisma.highScore.createMany({
    data: [
      { userId: user1.id, score: 12500, waveReached: 12 },
      { userId: user2.id, score: 8500, waveReached: 8 },
      { userId: user3.id, score: 15000, waveReached: 15 },
    ],
  });

  console.log('Database seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
