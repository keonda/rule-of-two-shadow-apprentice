export interface Position {
  x: number;
  y: number;
}

export type EnemyType = 'melee' | 'ranged' | 'boss';

export interface Enemy {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  type: EnemyType;
  health: number;
  maxHealth: number;
  speed: number;
  damage: number;
  scoreValue: number;
  
  // Pushback physics
  pushBackX: number;
  pushBackY: number;
  pushBackDuration: number; // in frames or ms
  
  // Shooting state (for ranged)
  shootCooldown: number;
  shootTimer: number;

  // Boss attack state
  bossSpecialTimer?: number;
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  damage: number;
  owner: 'player' | 'enemy';
}

export type ParticleType = 'spark' | 'lightning' | 'push' | 'dash' | 'blood' | 'dust';

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  decay: number;
  type: ParticleType;
  lightningPoints?: Position[]; // for drawing lightning arcs
}

export interface PlayerStats {
  health: number;
  maxHealth: number;
  energy: number;
  maxEnergy: number;
  speed: number;
  
  // Cooldowns (in ms or frames; we can store the max cooldown values)
  lightningCooldown: number;
  voidPushCooldown: number;
  leapCooldown: number;

  // Active Upgrade Levels
  lightningLevel: number;
  voidPushLevel: number;
  leapLevel: number;
  healthLevel: number;
  energyRegenLevel: number;
}

export interface GameUpgrade {
  id: string;
  name: string;
  description: string;
  effect: (stats: PlayerStats) => PlayerStats;
}
