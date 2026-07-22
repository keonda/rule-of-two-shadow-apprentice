import { Enemy, EnemyType, Particle, PlayerStats, Projectile, Position, Canister, Hazard, Wall, TetherLink, MasterState } from '../types/game';
import { audioManager } from './audio';

export class ShadowApprenticeGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  
  // Callbacks
  private onStatsChange: (stats: PlayerStats, currentHealth: number, currentEnergy: number, score: number, wave: number, comboCount: number, masterState?: MasterState) => void;
  private onGameOver: (score: number, wave: number, upgrades: string[]) => void;
  private onUpgradeChoice: () => void;
  private onMasterTrialDefeated: () => void;

  // Game Entities
  public playerX: number = 400;
  public playerY: number = 300;
  public playerRadius: number = 18;
  public playerHealth: number = 100;
  public playerEnergy: number = 100;
  public playerStats: PlayerStats;
  
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private canisters: Canister[] = [];
  private hazards: Hazard[] = [];
  private walls: Wall[] = [];

  // Master Companion (Rule of Two AI)
  public masterX: number = 280;
  public masterY: number = 220;
  public masterRadius: number = 22;
  private tetherLinks: TetherLink[] = [];
  private masterTetherTimer: number = 0;
  private masterOverloadTimer: number = 0;
  private masterInterventionCooldown: number = 0;
  private maxInterventionCooldown: number = 2700; // 45 seconds at 60 FPS
  private isSharingDamage: boolean = false;
  
  // Cooldown Trackers (in frames or ms; we will use time-based or frame-based, frame-based is easy for 60fps)
  // Let's use timestamp based or simple frame counters. Let's use simple frame counters at 60 FPS.
  private lightningTimer: number = 0;
  private voidPushTimer: number = 0;
  private leapTimer: number = 0;

  // Leap / Dash State
  private isLeaping: boolean = false;
  private leapFrameCount: number = 0;
  private leapMaxFrames: number = 10;
  private leapDirX: number = 0;
  private leapDirY: number = 0;
  private leapInvulnFrames: number = 15;
  private playerInvulnTimer: number = 0;
  private leapHitEnemies: Set<string> = new Set();

  // Input State
  private keys: { [key: string]: boolean } = {};
  private mouseX: number = 0;
  private mouseY: number = 0;
  private mouseClicked: boolean = false;

  // Game Loop
  private animationFrameId: number | null = null;
  private isPaused: boolean = false;
  private isGameActive: boolean = true;
  
  // Game progression
  public score: number = 0;
  public wave: number = 1;
  private enemiesToSpawn: number = 0;
  private enemiesRemaining: number = 0;
  private enemiesSpawned: number = 0;
  
  // Combo mechanics
  public comboCount: number = 0;
  private comboDecayTimer: number = 0;
  private spawnInterval: number = 120; // frames between spawns (2 seconds)
  private spawnTimer: number = 0;
  private currentUpgradesSelected: string[] = [];

  // Visual effects
  private screenShakeIntensity: number = 0;
  private arenaWidth: number = 1200;
  private arenaHeight: number = 900;
  private cameraX: number = 0;
  private cameraY: number = 0;

  // Runes for background
  private bgRunes: { x: number; y: number; char: string; opacity: number; pulseDir: number }[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    onStatsChange: (stats: PlayerStats, currentHealth: number, currentEnergy: number, score: number, wave: number, comboCount: number, masterState?: MasterState) => void,
    onUpgradeChoice: () => void,
    onMasterTrialDefeated: () => void,
    onGameOver: (score: number, wave: number, upgrades: string[]) => void
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get 2D context');
    this.ctx = context;
    
    this.onStatsChange = onStatsChange;
    this.onUpgradeChoice = onUpgradeChoice;
    this.onMasterTrialDefeated = onMasterTrialDefeated;
    this.onGameOver = onGameOver;

    // Base Player Stats
    this.playerStats = {
      health: 100,
      maxHealth: 100,
      energy: 100,
      maxEnergy: 100,
      speed: 4.5,
      lightningCooldown: 45, // frames (~0.75s)
      voidPushCooldown: 120, // frames (~2s)
      leapCooldown: 90,      // frames (~1.5s)
      lightningLevel: 1,
      voidPushLevel: 1,
      leapLevel: 1,
      healthLevel: 1,
      energyRegenLevel: 1,
      lightningSlow: false,
      lightningChainCount: 0,
      vortexPush: false,
      shatterCone: false,
      voidAegis: false,
      vaporTrail: false,
      shield: 0
    };

    this.playerHealth = this.playerStats.maxHealth;
    this.playerEnergy = this.playerStats.maxEnergy;

    this.initBackgroundRunes();
    this.setupInput();
    this.startWave();
  }

  private initBackgroundRunes() {
    const glyphs = ['☠', '⚡', '☯', '⛧', '⛤', '⚝', '▲', '▼', '◆', '◈'];
    for (let i = 0; i < 40; i++) {
      this.bgRunes.push({
        x: Math.random() * this.arenaWidth,
        y: Math.random() * this.arenaHeight,
        char: glyphs[Math.floor(Math.random() * glyphs.length)],
        opacity: Math.random() * 0.4 + 0.1,
        pulseDir: Math.random() > 0.5 ? 0.005 : -0.005
      });
    }
  }

  private setupInput() {
    const handleKeyDown = (e: KeyboardEvent) => {
      this.keys[e.key.toLowerCase()] = true;
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        this.triggerLeap();
      }
      if (e.key.toLowerCase() === 'e') {
        this.triggerVoidPush();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      this.keys[e.key.toLowerCase()] = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      this.mouseX = (e.clientX - rect.left) * scaleX + this.cameraX;
      this.mouseY = (e.clientY - rect.top) * scaleY + this.cameraY;
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) { // Left click
        this.mouseClicked = true;
      } else if (e.button === 2) { // Right click
        e.preventDefault();
        this.triggerVoidPush();
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        this.mouseClicked = false;
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    this.canvas.addEventListener('mousemove', handleMouseMove);
    this.canvas.addEventListener('mousedown', handleMouseDown);
    this.canvas.addEventListener('mouseup', handleMouseUp);
    this.canvas.addEventListener('contextmenu', handleContextMenu);

    // Save cleanup references
    this.cleanupInput = () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      this.canvas.removeEventListener('mousemove', handleMouseMove);
      this.canvas.removeEventListener('mousedown', handleMouseDown);
      this.canvas.removeEventListener('mouseup', handleMouseUp);
      this.canvas.removeEventListener('contextmenu', handleContextMenu);
    };
  }

  private cleanupInput() {}

  public destroy() {
    this.isGameActive = false;
    audioManager.stopSoundtrack();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.cleanupInput();
  }

  public setPaused(paused: boolean) {
    this.isPaused = paused;
    if (paused) {
      audioManager.stopSoundtrack();
    } else {
      audioManager.startSoundtrack();
    }
  }

  // Wave Management
  private startWave() {
    this.enemies = [];
    this.projectiles = [];
    this.spawnTimer = 0;
    this.enemiesSpawned = 0;

    const isNewTier = this.wave === 1 || (this.wave - 1) % 3 === 0;
    if (isNewTier) {
      this.generateWalls();
      this.generateHazards();
      this.generateCanisters();
    } else {
      // Within the same tier, canisters replenish to make sure there is ammo, but walls/hazards persist
      if (this.canisters.length < 2) {
        this.generateCanisters();
      } else {
        // Stop any currently moving canisters
        this.canisters.forEach(c => {
          c.vx = 0;
          c.vy = 0;
          c.isMoving = false;
        });
      }
    }
    
    audioManager.setWave(this.wave);
    audioManager.startSoundtrack();
    
    const isMasterTrial = this.wave % 3 === 0;

    if (isMasterTrial) {
      this.enemiesToSpawn = 1; // Just the boss
      this.enemiesRemaining = 1;
      audioManager.playTrialSpawn();
    } else {
      // Normal wave formula
      this.enemiesToSpawn = 4 + this.wave * 3;
      this.enemiesRemaining = this.enemiesToSpawn;
    }
    
    // Notify UI
    this.triggerStatsCallback();
  }

  private incrementCombo(amount: number) {
    this.comboCount = Math.min(50, this.comboCount + amount);
    this.comboDecayTimer = 0;
  }

  private triggerStatsCallback() {
    this.onStatsChange(
      this.playerStats,
      this.playerHealth,
      this.playerEnergy,
      this.score,
      this.wave,
      this.comboCount,
      {
        x: this.masterX,
        y: this.masterY,
        isOverloading: this.masterOverloadTimer > 0,
        overloadTimer: this.masterOverloadTimer,
        interventionCooldown: this.masterInterventionCooldown,
        maxInterventionCooldown: this.maxInterventionCooldown,
        activeTethersCount: this.tetherLinks.length
      }
    );
  }

  // Active abilities
  private triggerLeap() {
    if (!this.isGameActive || this.isPaused || this.isLeaping) return;
    if (this.leapTimer > 0) return;
    
    // Determine movement direction
    let dx = 0;
    let dy = 0;
    if (this.keys['w'] || this.keys['arrowup']) dy -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) dy += 1;
    if (this.keys['a'] || this.keys['arrowleft']) dx -= 1;
    if (this.keys['d'] || this.keys['arrowright']) dx += 1;

    // Default to facing/mouse direction if no keys pressed
    if (dx === 0 && dy === 0) {
      const angle = Math.atan2(this.mouseY - this.playerY, this.mouseX - this.playerX);
      dx = Math.cos(angle);
      dy = Math.sin(angle);
    } else {
      // Normalize
      const length = Math.sqrt(dx * dx + dy * dy);
      dx /= length;
      dy /= length;
    }

    const energyCost = 15;
    if (this.playerEnergy < energyCost) return; // Not enough energy

    // Commit leap
    this.playerEnergy -= energyCost;
    this.isLeaping = true;
    this.leapFrameCount = 0;
    this.leapDirX = dx;
    this.leapDirY = dy;
    this.playerInvulnTimer = this.leapInvulnFrames;
    this.leapTimer = this.playerStats.leapCooldown;
    this.leapHitEnemies.clear();
    
    audioManager.playLeap();
    this.triggerStatsCallback();
  }

  private triggerVoidPush() {
    if (!this.isGameActive || this.isPaused) return;
    if (this.voidPushTimer > 0) return;

    const energyCost = 25;
    if (this.playerEnergy < energyCost) return;

    this.playerEnergy -= energyCost;
    this.voidPushTimer = this.playerStats.voidPushCooldown;

    audioManager.playPush();
    this.screenShakeIntensity = 12;

    // Angle of push based on mouse
    const pushAngle = Math.atan2(this.mouseY - this.playerY, this.mouseX - this.playerX);
    const coneAngle = Math.PI / (1.5 + this.playerStats.voidPushLevel * 0.15); // becomes narrower/focused or wider based on stats. Let's make it wider!
    const baseRadius = 140 + this.playerStats.voidPushLevel * 20;
    const pushForce = 12 + this.playerStats.voidPushLevel * 2;

    // Spawn push particle arc
    this.spawnPushParticles(this.playerX, this.playerY, pushAngle, baseRadius);

    // Spawn Singularity Vortex if specialization is active
    if (this.playerStats.vortexPush) {
      const vortexX = this.playerX + Math.cos(pushAngle) * 90;
      const vortexY = this.playerY + Math.sin(pushAngle) * 90;

      this.particles.push({
        id: Math.random().toString(),
        x: vortexX,
        y: vortexY,
        vx: 0,
        vy: 0,
        radius: 70, // pull radius
        color: 'rgba(124, 58, 237, 0.6)',
        alpha: 1.0,
        decay: 0.005, // lasts ~3.3s
        type: 'vortex'
      });
    }

    // Apply pushback to canisters
    this.canisters.forEach(c => {
      const dx = c.x - this.playerX;
      const dy = c.y - this.playerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < baseRadius) {
        const angleToCanister = Math.atan2(dy, dx);
        let angleDiff = Math.abs(angleToCanister - pushAngle);
        while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - Math.PI * 2);

        if (angleDiff < coneAngle) {
          const launchSpeed = 16 + this.playerStats.voidPushLevel * 3;
          c.vx = Math.cos(angleToCanister) * launchSpeed;
          c.vy = Math.sin(angleToCanister) * launchSpeed;
          c.isMoving = true;
        }
      }
    });

    // Apply pushback to enemies
    this.enemies.forEach(enemy => {
      const dx = enemy.x - this.playerX;
      const dy = enemy.y - this.playerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < baseRadius) {
        const angleToEnemy = Math.atan2(dy, dx);
        // Check if within cone angle
        let angleDiff = Math.abs(angleToEnemy - pushAngle);
        // Normalize angle difference to [0, PI]
        while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - Math.PI * 2);

        if (angleDiff < coneAngle) {
          enemy.pushBackX = Math.cos(angleToEnemy) * pushForce;
          enemy.pushBackY = Math.sin(angleToEnemy) * pushForce;
          enemy.pushBackDuration = 20; // 20 frames of stun/push
          
          const comboMult = 1 + (this.comboCount * 0.01);
          let damage = 5 * this.playerStats.voidPushLevel * comboMult;
          
          // Shatter Blast bonus damage
          if (enemy.isSlowed && this.playerStats.shatterCone) {
            damage *= 2.5;
            this.spawnHitParticles(enemy.x, enemy.y, '#06b6d4', 15);
          }
          enemy.health -= damage;
          this.applySharedTetherDamage(enemy.id, damage);
          
          this.incrementCombo(1);
          this.spawnHitParticles(enemy.x, enemy.y, 'purple', 8);
        }
      }
    });

    // Deflect projectiles
    this.projectiles.forEach(p => {
      if (p.owner === 'enemy') {
        const dx = p.x - this.playerX;
        const dy = p.y - this.playerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < baseRadius) {
          const angleToP = Math.atan2(dy, dx);
          let angleDiff = Math.abs(angleToP - pushAngle);
          while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - Math.PI * 2);

          if (angleDiff < coneAngle) {
            // Deflect!
            const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
            const deflectAngle = angleToP; // fly away
            p.vx = Math.cos(deflectAngle) * speed * 1.5;
            p.vy = Math.sin(deflectAngle) * speed * 1.5;
            p.owner = 'player';
            p.damage *= 2; // Buff deflated projectles
            p.color = 'purple';
          }
        }
      }
    });

    this.triggerStatsCallback();
  }

  private triggerShadowLightning() {
    if (this.lightningTimer > 0) return;

    // Find enemies in range
    const range = 250 + this.playerStats.lightningLevel * 25;
    const lightningDmg = 12 * (1 + (this.playerStats.lightningLevel - 1) * 0.15);
    const bounceTargets = this.playerStats.lightningLevel + (this.playerStats.lightningChainCount || 0); // level 1: 1 target, level 2: 2 targets, etc. Plus chain count specialization

    // Sort enemies by distance
    const sortedEnemies = this.enemies
      .map(e => {
        const dx = e.x - this.playerX;
        const dy = e.y - this.playerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return { enemy: e, dist };
      })
      .filter(item => item.dist < range)
      .sort((a, b) => a.dist - b.dist);

    if (sortedEnemies.length === 0) return; // No targets in range

    // We have a target, consume energy
    const energyCost = 8;
    if (this.playerEnergy < energyCost) return;
    this.playerEnergy -= energyCost;
    this.lightningTimer = this.playerStats.lightningCooldown;

    audioManager.playLightning();

    // Trace lightning chain
    let prevSource: Position = { x: this.playerX, y: this.playerY };
    const hitEnemies = new Set<string>();

    for (let i = 0; i < bounceTargets; i++) {
      // Find closest un-hit enemy
      const nextTarget = sortedEnemies.find(item => !hitEnemies.has(item.enemy.id));
      if (!nextTarget) break; // No more targets in range

      const enemy = nextTarget.enemy;
      hitEnemies.add(enemy.id);

      // Apply damage with combo multiplier
      const comboMult = 1 + (this.comboCount * 0.01);
      enemy.health -= lightningDmg * comboMult;
      this.applySharedTetherDamage(enemy.id, lightningDmg * comboMult);
      
      this.incrementCombo(1);

      // Apply Discharge Freeze slow
      if (this.playerStats.lightningSlow) {
        enemy.isSlowed = true;
        enemy.slowTimer = 90; // 1.5s slow
      }

      // Spawn lightning particle
      this.spawnLightningArc(prevSource, enemy);

      // Hit sparks
      this.spawnHitParticles(enemy.x, enemy.y, '#a855f7', 10);

      // Set source for next bounce
      prevSource = { x: enemy.x, y: enemy.y };
    }

    this.triggerStatsCallback();
  }

  // Spawning Helpers
  private spawnEnemy() {
    if (this.enemiesSpawned >= this.enemiesToSpawn) return;

    const isMasterTrial = this.wave % 3 === 0;

    let type: EnemyType = 'melee';
    let radius = 16;
    let color = '#ef4444'; // red
    let health = 20 + this.wave * 5;
    let speed = 1.8 + Math.random() * 0.5 + (this.wave * 0.05);
    let damage = 8 + this.wave * 1.5;
    let scoreValue = 100 * this.wave;

    if (isMasterTrial) {
      type = 'boss';
      radius = 35;
      color = '#7e22ce'; // purple boss
      health = 180 + this.wave * 70;
      speed = 1.8 + (this.wave * 0.05);
      damage = 25 + this.wave * 3;
      scoreValue = 1000 * this.wave;
    } else {
      const randVal = Math.random();
      if (this.wave >= 4 && randVal < 0.22) {
        // Stealth Assassin
        type = 'assassin';
        radius = 13;
        color = '#ec4899'; // magenta outline
        health = 25 + this.wave * 4;
        speed = 2.4 + (this.wave * 0.08); // fast!
        damage = 18 + this.wave * 2;
        scoreValue = 300 * this.wave;
      } else if (this.wave > 1 && randVal < 0.45) {
        type = 'ranged';
        radius = 14;
        color = '#f97316'; // orange ranged
        health = 15 + this.wave * 4;
        speed = 1.2 + (this.wave * 0.03);
        damage = 10 + this.wave * 1.2;
        scoreValue = 150 * this.wave;
      }
    }

    // Spawn at boundaries or just outside the visible screen
    const angle = Math.random() * Math.PI * 2;
    const distance = 500 + Math.random() * 100; // spawn distance
    let spawnX = this.playerX + Math.cos(angle) * distance;
    let spawnY = this.playerY + Math.sin(angle) * distance;

    // Ensure it doesn't spawn inside a wall
    let wallAttempts = 0;
    while (this.isPositionInsideWall(spawnX, spawnY, radius) && wallAttempts < 10) {
      const newAngle = Math.random() * Math.PI * 2;
      const newDistance = 500 + Math.random() * 100;
      spawnX = this.playerX + Math.cos(newAngle) * newDistance;
      spawnY = this.playerY + Math.sin(newAngle) * newDistance;
      wallAttempts++;
    }

    // Clamp inside arena boundaries
    spawnX = Math.max(radius, Math.min(this.arenaWidth - radius, spawnX));
    spawnY = Math.max(radius, Math.min(this.arenaHeight - radius, spawnY));

    this.enemies.push({
      id: Math.random().toString(36).substr(2, 9),
      x: spawnX,
      y: spawnY,
      radius,
      color,
      type,
      health,
      maxHealth: health,
      speed,
      damage,
      scoreValue,
      pushBackX: 0,
      pushBackY: 0,
      pushBackDuration: 0,
      shootCooldown: 120 - (this.wave * 4), // shots cooldown
      shootTimer: Math.random() * 60, // staggered initial shot
      bossSpecialTimer: type === 'boss' ? 0 : undefined
    });

    this.enemiesSpawned++;
  }

  // Particles generator
  private spawnLightningArc(from: Position, to: Position) {
    const points: Position[] = [];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // Break the lightning path into segments
    const segments = Math.max(5, Math.floor(dist / 20));
    points.push({ x: from.x, y: from.y });

    let currentX = from.x;
    let currentY = from.y;

    for (let i = 1; i < segments; i++) {
      const ratio = i / segments;
      const targetX = from.x + dx * ratio;
      const targetY = from.y + dy * ratio;

      // Add offset perpendicular to the direction
      const perpAngle = Math.atan2(dy, dx) + Math.PI / 2;
      const offset = (Math.random() - 0.5) * 35; // sway amount

      currentX = targetX + Math.cos(perpAngle) * offset;
      currentY = targetY + Math.sin(perpAngle) * offset;

      points.push({ x: currentX, y: currentY });
    }

    points.push({ x: to.x, y: to.y });

    this.particles.push({
      id: Math.random().toString(),
      x: from.x,
      y: from.y,
      vx: 0,
      vy: 0,
      radius: 2,
      color: '#c084fc', // purple light
      alpha: 1.0,
      decay: 0.1,
      type: 'lightning',
      lightningPoints: points
    });
  }

  private spawnPushParticles(x: number, y: number, angle: number, radius: number) {
    // Render shockwave particle
    this.particles.push({
      id: Math.random().toString(),
      x,
      y,
      vx: 0,
      vy: 0,
      radius: 10, // will grow
      color: '#818cf8', // blue/purple glow
      alpha: 0.8,
      decay: 0.05,
      type: 'push',
      lightningPoints: [{ x: angle, y: radius }] // abuse structure to store angle/radius
    });

    // Dust particles
    for (let i = 0; i < 20; i++) {
      const spreadAngle = angle + (Math.random() - 0.5) * (Math.PI / 2);
      const speed = 4 + Math.random() * 6;
      this.particles.push({
        id: Math.random().toString(),
        x,
        y,
        vx: Math.cos(spreadAngle) * speed,
        vy: Math.sin(spreadAngle) * speed,
        radius: 2 + Math.random() * 4,
        color: '#4b5563',
        alpha: 0.6,
        decay: 0.02 + Math.random() * 0.02,
        type: 'dust'
      });
    }
  }

  private spawnHitParticles(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.5;
      this.particles.push({
        id: Math.random().toString(),
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 1.5 + Math.random() * 2.5,
        color,
        alpha: 1.0,
        decay: 0.03 + Math.random() * 0.04,
        type: 'spark'
      });
    }
  }

  private spawnDashGhost(x: number, y: number) {
    this.particles.push({
      id: Math.random().toString(),
      x,
      y,
      vx: 0,
      vy: 0,
      radius: this.playerRadius,
      color: 'rgba(168, 85, 247, 0.4)', // purple translucent ghost
      alpha: 0.6,
      decay: 0.08,
      type: 'dash'
    });
  }

  // Update Game Logic (60 FPS tick)
  public update() {
    if (!this.isGameActive || this.isPaused) return;

    // Decrement timers
    if (this.lightningTimer > 0) this.lightningTimer--;
    if (this.voidPushTimer > 0) this.voidPushTimer--;
    if (this.leapTimer > 0) this.leapTimer--;
    if (this.playerInvulnTimer > 0) this.playerInvulnTimer--;

    // Energy regeneration
    const baseEnergyRegen = 0.25;
    const energyRegenMultiplier = 1 + (this.playerStats.energyRegenLevel - 1) * 0.30;
    this.playerEnergy = Math.min(
      this.playerStats.maxEnergy,
      this.playerEnergy + baseEnergyRegen * energyRegenMultiplier
    );

    // Decay combo over time
    if (this.comboCount > 0) {
      this.comboDecayTimer++;
      if (this.comboDecayTimer >= 120) { // 2 seconds of inactivity
        if (this.comboDecayTimer % 6 === 0) {
          this.comboCount--;
        }
      }
    }

    this.updatePlayerMovement();
    this.updateMaster();
    this.updateEnemies();
    this.updateProjectiles();
    this.updateCanisters();
    this.updateHazards();
    this.updateParticles();
    this.updateCamera();
    this.handleWaveSpawner();
    this.checkCollisions();

    // Check if wave is clear
    if (this.enemies.length === 0 && this.enemiesSpawned >= this.enemiesToSpawn && this.enemiesRemaining > 0) {
      this.enemiesRemaining = 0;
      this.handleWaveCompletion();
    }

    // Trigger regular statistics sync
    this.triggerStatsCallback();
  }

  private updatePlayerMovement() {
    if (this.isLeaping) {
      // Leap movement
      const leapSpeed = this.playerStats.speed * 2.5;
      this.playerX += this.leapDirX * leapSpeed;
      this.playerY += this.leapDirY * leapSpeed;

      // Spawn ghost particle trails
      if (this.leapFrameCount % 2 === 0) {
        this.spawnDashGhost(this.playerX, this.playerY);
      }

      // Brimstone Dash trail
      if (this.playerStats.vaporTrail) {
        this.particles.push({
          id: Math.random().toString(),
          x: this.playerX,
          y: this.playerY,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          radius: 30, // damage radius
          color: 'rgba(239, 68, 68, 0.4)',
          alpha: 1.0,
          decay: 0.02, // lasts 50 frames
          type: 'vapor'
        });
      }

      // Check collision and damage enemies during leap
      const hitRadius = this.playerRadius + 15; // slightly wider hit zone
      const comboMult = 1 + (this.comboCount * 0.01);
      const leapDmg = 25 * this.playerStats.leapLevel * comboMult;
      
      this.enemies.forEach(enemy => {
        if (this.leapHitEnemies.has(enemy.id)) return;
        
        const dx = enemy.x - this.playerX;
        const dy = enemy.y - this.playerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < hitRadius + enemy.radius) {
          enemy.health -= leapDmg;
          this.applySharedTetherDamage(enemy.id, leapDmg);
          this.leapHitEnemies.add(enemy.id);
          this.incrementCombo(2); // Leap hits add 2 to combo
          
          // Pushback enemy slightly away from the leap path
          const pushAngle = Math.atan2(dy, dx);
          enemy.pushBackX = Math.cos(pushAngle) * 7;
          enemy.pushBackY = Math.sin(pushAngle) * 7;
          enemy.pushBackDuration = 12;
          
          // Spawn nice glowing purple particles
          this.spawnHitParticles(enemy.x, enemy.y, '#d8b4fe', 8);
          audioManager.playEnemyHurt();
        }
      });

      this.leapFrameCount++;
      if (this.leapFrameCount >= this.leapMaxFrames) {
        this.isLeaping = false;
        
        // Void Shroud shield trigger on landing
        if (this.playerStats.voidAegis) {
          this.playerStats.shield = 30; // 30 health point shield
          audioManager.playUpgrade();
        }
      }
    } else {
      // Normal WASD movement
      let dx = 0;
      let dy = 0;
      if (this.keys['w'] || this.keys['arrowup']) dy -= 1;
      if (this.keys['s'] || this.keys['arrowdown']) dy += 1;
      if (this.keys['a'] || this.keys['arrowleft']) dx -= 1;
      if (this.keys['d'] || this.keys['arrowright']) dx += 1;

      if (dx !== 0 && dy !== 0) {
        const length = Math.sqrt(dx * dx + dy * dy);
        dx /= length;
        dy /= length;
      }

      // Apply speed boost from combo (+0.5% per combo point, max +25% speed)
      const comboSpeedBoost = 1 + (this.comboCount * 0.005);
      this.playerX += dx * this.playerStats.speed * comboSpeedBoost;
      this.playerY += dy * this.playerStats.speed * comboSpeedBoost;

      // Auto-fire Shadow Lightning when holding down left mouse click
      if (this.mouseClicked) {
        this.triggerShadowLightning();
      }
    }

    // Check wall collisions for player
    const playerObj = { x: this.playerX, y: this.playerY, radius: this.playerRadius };
    this.handleWallCollision(playerObj);
    this.playerX = playerObj.x;
    this.playerY = playerObj.y;

    // Bound player to Arena
    this.playerX = Math.max(this.playerRadius, Math.min(this.arenaWidth - this.playerRadius, this.playerX));
    this.playerY = Math.max(this.playerRadius, Math.min(this.arenaHeight - this.playerRadius, this.playerY));
  }

  private updateEnemies() {
    this.enemies.forEach(enemy => {
      // Process slow timers
      if (enemy.isSlowed && enemy.slowTimer !== undefined) {
        enemy.slowTimer--;
        if (enemy.slowTimer <= 0) {
          enemy.isSlowed = false;
        }
      }

      // Apply pushback physics
      if (enemy.pushBackDuration > 0) {
        enemy.x += enemy.pushBackX;
        enemy.y += enemy.pushBackY;
        
        // Decay pushback
        enemy.pushBackX *= 0.85;
        enemy.pushBackY *= 0.85;
        enemy.pushBackDuration--;
        
        // Clamp to arena
        enemy.x = Math.max(enemy.radius, Math.min(this.arenaWidth - enemy.radius, enemy.x));
        enemy.y = Math.max(enemy.radius, Math.min(this.arenaHeight - enemy.radius, enemy.y));
        return; // Stunned while pushed back
      }

      // Default AI chasing player
      const dx = this.playerX - enemy.x;
      const dy = this.playerY - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const currentSpeed = enemy.isSlowed ? enemy.speed * 0.5 : enemy.speed;

      if (enemy.type === 'melee') {
        if (dist > 0) {
          enemy.x += (dx / dist) * currentSpeed;
          enemy.y += (dy / dist) * currentSpeed;
        }
      } else if (enemy.type === 'ranged') {
        // Keep distance (approx 200px)
        const targetDist = 220;
        if (dist > targetDist + 20) {
          enemy.x += (dx / dist) * currentSpeed;
          enemy.y += (dy / dist) * currentSpeed;
        } else if (dist < targetDist - 20) {
          enemy.x -= (dx / dist) * currentSpeed;
          enemy.y -= (dy / dist) * currentSpeed;
        }

        // Shoot projectile
        enemy.shootTimer++;
        if (enemy.shootTimer >= enemy.shootCooldown) {
          enemy.shootTimer = 0;
          this.shootEnemyProjectile(enemy, dx, dy);
        }
      } else if (enemy.type === 'assassin') {
        // Assassin chases player
        if (dist > 0) {
          enemy.x += (dx / dist) * currentSpeed;
          enemy.y += (dy / dist) * currentSpeed;
        }

        // Teleport behind player
        enemy.blinkTimer = (enemy.blinkTimer || 0) + 1;
        if (enemy.blinkTimer >= 240) { // every 4 seconds
          if (dist < 320) {
            enemy.blinkTimer = 0;
            this.spawnHitParticles(enemy.x, enemy.y, '#ec4899', 10);
            
            // Teleport behind player aiming/facing angle
            const playerFacingAngle = Math.atan2(this.mouseY - this.playerY, this.mouseX - this.playerX);
            const targetX = this.playerX - Math.cos(playerFacingAngle) * 80;
            const targetY = this.playerY - Math.sin(playerFacingAngle) * 80;
            
            enemy.x = Math.max(enemy.radius, Math.min(this.arenaWidth - enemy.radius, targetX));
            enemy.y = Math.max(enemy.radius, Math.min(this.arenaHeight - enemy.radius, targetY));
            
            this.spawnHitParticles(enemy.x, enemy.y, '#ec4899', 10);
            audioManager.playLeap(); // teleport swoosh
          }
        }
      } else if (enemy.type === 'boss') {
        // Boss AI
        enemy.bossSpecialTimer = (enemy.bossSpecialTimer || 0) + 1;
        
        // Boss moves towards player
        if (dist > 0) {
          enemy.x += (dx / dist) * currentSpeed;
          enemy.y += (dy / dist) * currentSpeed;
        }

        // Boss attacks every 2.5 seconds (150 frames)
        if (enemy.bossSpecialTimer >= 150) {
          enemy.bossSpecialTimer = 0;
          this.triggerBossAttack(enemy, dx, dy);
        }
      }

      // Check wall collisions for enemies
      this.handleWallCollision(enemy);

      // Clamp to arena
      enemy.x = Math.max(enemy.radius, Math.min(this.arenaWidth - enemy.radius, enemy.x));
      enemy.y = Math.max(enemy.radius, Math.min(this.arenaHeight - enemy.radius, enemy.y));
    });
  }

  private shootEnemyProjectile(enemy: Enemy, dx: number, dy: number) {
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    const projSpeed = 4 + (this.wave * 0.15);
    const vx = (dx / dist) * projSpeed;
    const vy = (dy / dist) * projSpeed;

    this.projectiles.push({
      id: Math.random().toString(),
      x: enemy.x,
      y: enemy.y,
      vx,
      vy,
      radius: 5,
      color: '#ef4444', // red projectile
      damage: enemy.damage,
      owner: 'enemy'
    });
  }

  private triggerBossAttack(boss: Enemy, dx: number, dy: number) {
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    // Shot pattern: 5 projectles spread
    const baseAngle = Math.atan2(dy, dx);
    const projSpeed = 4.5;
    const numShots = 5;
    const spreadAngle = Math.PI / 4; // 45 degree spread

    for (let i = 0; i < numShots; i++) {
      const angleOffset = spreadAngle * (i / (numShots - 1) - 0.5);
      const angle = baseAngle + angleOffset;
      this.projectiles.push({
        id: Math.random().toString(),
        x: boss.x,
        y: boss.y,
        vx: Math.cos(angle) * projSpeed,
        vy: Math.sin(angle) * projSpeed,
        radius: 6,
        color: '#f43f5e', // deep red
        damage: boss.damage * 0.8,
        owner: 'enemy'
      });
    }

    // Jump visual sparks from boss
    this.spawnHitParticles(boss.x, boss.y, '#e11d48', 12);
  }

  private updateProjectiles() {
    this.projectiles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
    });

    // Remove off-screen, out-of-arena, or wall-collided projectiles
    this.projectiles = this.projectiles.filter(p => {
      const insideArena = p.x >= 0 && p.x <= this.arenaWidth && p.y >= 0 && p.y <= this.arenaHeight;
      if (!insideArena) return false;
      
      if (this.isPositionInsideWall(p.x, p.y, p.radius)) {
        this.spawnHitParticles(p.x, p.y, p.color, 4);
        return false;
      }
      
      return true;
    });
  }

  private updateParticles() {
    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;

      if (p.type === 'push') {
        // Expand push shockwave
        const angleRadiusInfo = p.lightningPoints ? p.lightningPoints[0] : null;
        if (angleRadiusInfo) {
          p.radius += 12; // Grow radius
        }
      } else if (p.type === 'vortex') {
        // Vortex pull and damage enemies
        this.enemies.forEach(enemy => {
          const dx = p.x - enemy.x;
          const dy = p.y - enemy.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < p.radius + 30) {
            const pullForce = Math.max(0.5, (p.radius - dist) * 0.04);
            const pullAngle = Math.atan2(dy, dx);
            
            enemy.x += Math.cos(pullAngle) * pullForce;
            enemy.y += Math.sin(pullAngle) * pullForce;
            
            enemy.health -= 0.15; // minor tick damage
            
            if (Math.random() < 0.1) {
              this.particles.push({
                id: Math.random().toString(),
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(pullAngle) * 2.5,
                vy: Math.sin(pullAngle) * 2.5,
                radius: 1,
                color: '#8b5cf6',
                alpha: 0.8,
                decay: 0.04,
                type: 'spark'
              });
            }
          }
        });
      } else if (p.type === 'vapor') {
        // Damaging shadow trail
        this.enemies.forEach(enemy => {
          const dx = p.x - enemy.x;
          const dy = p.y - enemy.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < p.radius + enemy.radius) {
            enemy.health -= 0.35; // tick damage
            if (Math.random() < 0.05) {
              this.spawnHitParticles(enemy.x, enemy.y, '#ef4444', 2);
            }
          }
        });
      }
    });

    this.particles = this.particles.filter(p => p.alpha > 0);

    // Pulse background runes
    this.bgRunes.forEach(rune => {
      rune.opacity += rune.pulseDir;
      if (rune.opacity > 0.4 || rune.opacity < 0.05) {
        rune.pulseDir = -rune.pulseDir;
      }
    });
  }

  private updateCamera() {
    // Centered on player
    const targetCamX = this.playerX - this.canvas.width / 2;
    const targetCamY = this.playerY - this.canvas.height / 2;

    // Direct interpolation
    this.cameraX += (targetCamX - this.cameraX) * 0.1;
    this.cameraY += (targetCamY - this.cameraY) * 0.1;

    // Restrict camera to arena bounds
    this.cameraX = Math.max(0, Math.min(this.arenaWidth - this.canvas.width, this.cameraX));
    this.cameraY = Math.max(0, Math.min(this.arenaHeight - this.canvas.height, this.cameraY));
  }

  private handleWaveSpawner() {
    const isMasterTrial = this.wave % 3 === 0;

    if (this.enemiesSpawned < this.enemiesToSpawn) {
      this.spawnTimer++;
      
      // Spawn speed gets slightly faster with waves
      const adjustedSpawnInterval = Math.max(40, this.spawnInterval - this.wave * 5);
      if (this.spawnTimer >= (isMasterTrial ? 30 : adjustedSpawnInterval)) {
        this.spawnTimer = 0;
        this.spawnEnemy();
      }
    }
  }

  private checkCollisions() {
    // Player invulnerable check
    const isInvulnerable = this.playerInvulnTimer > 0;

    // 1. Projectiles hitting player/enemies
    this.projectiles = this.projectiles.filter(proj => {
      if (proj.owner === 'enemy') {
        if (isInvulnerable) return true; // ignore hits while invulnerable

        const dx = proj.x - this.playerX;
        const dy = proj.y - this.playerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < proj.radius + this.playerRadius) {
          // Player hit!
          this.damagePlayer(proj.damage, 'projectile');
          this.spawnHitParticles(this.playerX, this.playerY, '#a855f7', 15);
          return false; // remove projectile
        }
      } else {
        // Player owned (deflected) projectile hits enemies
        for (let i = 0; i < this.enemies.length; i++) {
          const enemy = this.enemies[i];
          const dx = proj.x - enemy.x;
          const dy = proj.y - enemy.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < proj.radius + enemy.radius) {
            enemy.health -= proj.damage;
            this.applySharedTetherDamage(enemy.id, proj.damage);
            this.spawnHitParticles(enemy.x, enemy.y, '#c084fc', 8);
            audioManager.playEnemyHurt();
            return false; // remove projectile
          }
        }
      }
      return true;
    });

    // 2. Enemies touching player
    this.enemies.forEach(enemy => {
      if (isInvulnerable) return;

      const dx = enemy.x - this.playerX;
      const dy = enemy.y - this.playerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < enemy.radius + this.playerRadius) {
        // Player gets hit by contact
        this.damagePlayer(enemy.damage * 0.05, 'contact');
        
        // Push enemy back slightly so they don't stick completely
        const angle = Math.atan2(dy, dx);
        enemy.x += Math.cos(angle) * 3;
        enemy.y += Math.sin(angle) * 3;
      }
    });

    // 3. Clean dead enemies
    this.enemies = this.enemies.filter(enemy => {
      if (enemy.health <= 0) {
        this.score += enemy.scoreValue;
        this.spawnHitParticles(enemy.x, enemy.y, '#ef4444', 20);
        audioManager.playEnemyHurt();

        // 1. Health regeneration on kill (+2 HP baseline, scaling with health level)
        const healAmt = 2 + (this.playerStats.healthLevel - 1) * 1.5;
        this.playerHealth = Math.min(this.playerStats.maxHealth, this.playerHealth + healAmt);

        // Life siphon particle effect (glowing pinkish purple sparks siphoning into player)
        this.spawnHitParticles(this.playerX, this.playerY, '#ec4899', 6);

        // 2. Increment Dark Rage Combo
        this.incrementCombo(5);

        return false;
      }
      return true;
    });
  }

  private damagePlayer(amount: number, type?: 'contact' | 'projectile') {
    if (this.playerInvulnTimer > 0) return;
    
    // Calculate total level for Shadow Aegis bubble
    const totalLevel = this.playerStats.lightningLevel +
                       this.playerStats.voidPushLevel +
                       this.playerStats.leapLevel +
                       this.playerStats.healthLevel +
                       this.playerStats.energyRegenLevel;

    // Apply shield bubble damage reductions if active
    if (totalLevel > 5) {
      if (type === 'contact') {
        amount *= (1 / 3); // direct attacks do one third damage
      } else if (type === 'projectile') {
        amount *= 0.5; // laser/projectile attacks do half damage
      }
    }

    // Shield absorption first
    if (this.playerStats.shield && this.playerStats.shield > 0) {
      if (this.playerStats.shield >= amount) {
        this.playerStats.shield -= amount;
        this.spawnHitParticles(this.playerX, this.playerY, '#60a5fa', 6);
        return;
      } else {
        amount -= this.playerStats.shield;
        this.playerStats.shield = 0;
        this.spawnHitParticles(this.playerX, this.playerY, '#60a5fa', 6);
      }
    }

    this.playerHealth -= amount;
    this.screenShakeIntensity = Math.min(10, this.screenShakeIntensity + amount * 0.4);
    
    audioManager.playHurt();

    // Check Master Emergency Intervention if player takes lethal/critical damage
    if (this.playerHealth <= 25 && this.playerHealth > 0 && this.masterInterventionCooldown <= 0) {
      this.triggerMasterIntervention();
    }

    if (this.playerHealth <= 0) {
      this.playerHealth = 0;
      this.handleGameOver();
    }
  }

  private handleWaveCompletion() {
    const isMasterTrial = this.wave % 3 === 0;

    if (isMasterTrial) {
      this.onMasterTrialDefeated(); // trigger custom celebratory state / popup
    } else {
      this.wave++;
      this.startWave();
    }
  }

  public triggerNextWaveAfterUpgrade() {
    this.wave++;
    this.startWave();
  }

  private handleGameOver() {
    this.isGameActive = false;
    audioManager.playGameOver();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    this.onGameOver(this.score, this.wave, this.currentUpgradesSelected);
  }

  // Draw Game Loop
  public draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply Screen Shake
    this.ctx.save();
    if (this.screenShakeIntensity > 0) {
      const shakeX = (Math.random() - 0.5) * this.screenShakeIntensity;
      const shakeY = (Math.random() - 0.5) * this.screenShakeIntensity;
      this.ctx.translate(shakeX, shakeY);
      this.screenShakeIntensity *= 0.9; // decay
      if (this.screenShakeIntensity < 0.1) this.screenShakeIntensity = 0;
    }

    // Apply Camera translation
    this.ctx.translate(-this.cameraX, -this.cameraY);

    this.drawArena();
    this.drawHazards();
    this.drawCanisters();
    this.drawWalls();
    this.drawParticles();
    this.drawProjectiles();
    this.drawEnemies();
    this.drawMaster();
    this.drawPlayer();

    this.ctx.restore();
  }

  private drawArena() {
    // 1. Dark floor background
    this.ctx.fillStyle = '#0b0f19'; // deep slate
    this.ctx.fillRect(0, 0, this.arenaWidth, this.arenaHeight);

    // 2. Floor Grid
    this.ctx.strokeStyle = '#1e1b4b'; // dark purple lines
    this.ctx.lineWidth = 1;
    const gridSpacing = 60;
    
    this.ctx.beginPath();
    for (let x = 0; x < this.arenaWidth; x += gridSpacing) {
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.arenaHeight);
    }
    for (let y = 0; y < this.arenaHeight; y += gridSpacing) {
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.arenaWidth, y);
    }
    this.ctx.stroke();

    // 3. Drawing glowing runes
    this.ctx.save();
    this.ctx.font = '20px Outfit, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    
    this.bgRunes.forEach(rune => {
      this.ctx.fillStyle = `rgba(168, 85, 247, ${rune.opacity})`; // glowing violet
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = '#a855f7';
      this.ctx.fillText(rune.char, rune.x, rune.y);
    });
    this.ctx.restore();

    // 4. Arena boundaries
    this.ctx.strokeStyle = '#7e22ce'; // bright purple boundary
    this.ctx.lineWidth = 6;
    this.ctx.shadowBlur = 15;
    this.ctx.shadowColor = '#a855f7';
    this.ctx.strokeRect(0, 0, this.arenaWidth, this.arenaHeight);
    this.ctx.shadowBlur = 0; // reset
  }

  private drawPlayer() {
    // Draw Shadow Aegis bubble if total level is > 5 (meaning player has upgraded at least once)
    const totalLevel = this.playerStats.lightningLevel +
                       this.playerStats.voidPushLevel +
                       this.playerStats.leapLevel +
                       this.playerStats.healthLevel +
                       this.playerStats.energyRegenLevel;

    if (totalLevel > 5) {
      this.ctx.save();
      const levelDiff = totalLevel - 5;
      const bubbleRadius = this.playerRadius + 9 + Math.min(12, levelDiff * 0.8);
      const borderAlpha = Math.min(0.65, 0.15 + levelDiff * 0.05);
      const fillAlpha = Math.min(0.18, 0.02 + levelDiff * 0.015);
      
      const pulse = 1 + Math.sin(Date.now() * 0.004) * 0.025;
      const finalRadius = bubbleRadius * pulse;
      
      this.ctx.fillStyle = `rgba(168, 85, 247, ${fillAlpha})`; // translucent purple
      this.ctx.beginPath();
      this.ctx.arc(this.playerX, this.playerY, finalRadius, 0, Math.PI * 2);
      this.ctx.fill();
      
      this.ctx.strokeStyle = `rgba(192, 132, 252, ${borderAlpha})`; // violet
      this.ctx.lineWidth = 1.5 + Math.min(1.5, levelDiff * 0.15);
      this.ctx.shadowBlur = 6 + Math.min(10, levelDiff * 0.8);
      this.ctx.shadowColor = '#c084fc';
      this.ctx.beginPath();
      this.ctx.arc(this.playerX, this.playerY, finalRadius, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // Draw kinetic shield ring around player if active
    if (this.playerStats.shield && this.playerStats.shield > 0) {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(96, 165, 250, 0.75)'; // glowing blue ring
      this.ctx.lineWidth = 3;
      this.ctx.shadowBlur = 12;
      this.ctx.shadowColor = '#60a5fa';
      this.ctx.beginPath();
      this.ctx.arc(this.playerX, this.playerY, this.playerRadius + 5, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();
    }

    this.ctx.save();
    this.ctx.translate(this.playerX, this.playerY);

    // Invulnerable flash
    const isInvulnerable = this.playerInvulnTimer > 0;
    if (isInvulnerable && Math.floor(Date.now() / 50) % 2 === 0) {
      this.ctx.globalAlpha = 0.2;
    }

    // 1. Draw glowing dark aura
    const gradient = this.ctx.createRadialGradient(0, 0, 5, 0, 0, this.playerRadius * 2);
    gradient.addColorStop(0, 'rgba(126, 34, 206, 0.6)');
    gradient.addColorStop(0.5, 'rgba(168, 85, 247, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, this.playerRadius * 2, 0, Math.PI * 2);
    this.ctx.fill();

    // 2. Apprentice Hooded Figure (vector/original shape)
    // Draw cloak (outer circle)
    this.ctx.fillStyle = '#0f172a'; // slate-900 (very dark blue/black)
    this.ctx.beginPath();
    this.ctx.arc(0, 0, this.playerRadius, 0, Math.PI * 2);
    this.ctx.fill();
    
    // Cloak highlight ring
    this.ctx.strokeStyle = '#6b21a8'; // purple-800
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // Inner hood (shadow face)
    this.ctx.fillStyle = '#020617'; // slate-950 (absolute black)
    this.ctx.beginPath();
    this.ctx.arc(0, 0, this.playerRadius * 0.7, 0, Math.PI * 2);
    this.ctx.fill();

    // Determine facing direction angle based on mouse
    const angle = Math.atan2(this.mouseY - this.playerY, this.mouseX - this.playerX);
    this.ctx.rotate(angle);

    // 3. Glowing purple/violet eyes
    this.ctx.fillStyle = '#c084fc'; // purple-400
    this.ctx.shadowBlur = 8;
    this.ctx.shadowColor = '#c084fc';
    
    // Left eye
    this.ctx.beginPath();
    this.ctx.arc(this.playerRadius * 0.35, -this.playerRadius * 0.2, 2.5, 0, Math.PI * 2);
    this.ctx.fill();

    // Right eye
    this.ctx.beginPath();
    this.ctx.arc(this.playerRadius * 0.35, this.playerRadius * 0.2, 2.5, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }

  private drawEnemies() {
    this.enemies.forEach(enemy => {
      this.ctx.save();
      this.ctx.translate(enemy.x, enemy.y);

      // Check if slowed
      if (enemy.isSlowed) {
        this.ctx.strokeStyle = '#06b6d4'; // cyan border
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, enemy.radius + 3, 0, Math.PI * 2);
        this.ctx.stroke();
      }

      // Check if assassin (semi-invisible)
      if (enemy.type === 'assassin') {
        this.ctx.globalAlpha = 0.35; // semi-invisible shadow
      }

      // Enemy base shadow/cloak
      this.ctx.fillStyle = enemy.color;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Cloak border
      this.ctx.strokeStyle = enemy.type === 'assassin' ? '#ec4899' : '#000000';
      this.ctx.lineWidth = enemy.type === 'assassin' ? 2 : 1.5;
      this.ctx.stroke();

      // Shadow face area
      this.ctx.fillStyle = '#111';
      this.ctx.beginPath();
      this.ctx.arc(0, 0, enemy.radius * 0.7, 0, Math.PI * 2);
      this.ctx.fill();

      // Face direction (towards player)
      const angle = Math.atan2(this.playerY - enemy.y, this.playerX - enemy.x);
      this.ctx.rotate(angle);

      // Glowing Eyes
      this.ctx.fillStyle = enemy.type === 'assassin' ? '#f472b6' : '#ef4444'; // Glowing magenta/red eyes
      this.ctx.shadowBlur = 6;
      this.ctx.shadowColor = this.ctx.fillStyle as string;

      if (enemy.type === 'boss') {
        // Boss gets multiple terrifying eyes
        this.ctx.fillStyle = '#e11d48';
        this.ctx.beginPath();
        this.ctx.arc(enemy.radius * 0.35, -8, 3, 0, Math.PI * 2);
        this.ctx.arc(enemy.radius * 0.35, 8, 3, 0, Math.PI * 2);
        this.ctx.arc(enemy.radius * 0.45, -3, 2, 0, Math.PI * 2);
        this.ctx.arc(enemy.radius * 0.45, 3, 2, 0, Math.PI * 2);
        this.ctx.fill();
      } else {
        // Standard double eyes
        this.ctx.beginPath();
        this.ctx.arc(enemy.radius * 0.35, -enemy.radius * 0.2, 2.5, 0, Math.PI * 2);
        this.ctx.arc(enemy.radius * 0.35, enemy.radius * 0.2, 2.5, 0, Math.PI * 2);
        this.ctx.fill();
      }

      this.ctx.restore();

      // Draw small health bar above damaged enemies
      if (enemy.health < enemy.maxHealth) {
        const barWidth = enemy.radius * 2;
        const barHeight = 4;
        const healthPercent = Math.max(0, enemy.health / enemy.maxHealth);

        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this.ctx.fillRect(enemy.x - barWidth/2, enemy.y - enemy.radius - 12, barWidth, barHeight);

        this.ctx.fillStyle = '#ef4444';
        this.ctx.fillRect(enemy.x - barWidth/2, enemy.y - enemy.radius - 12, barWidth * healthPercent, barHeight);
      }
    });
  }

  private drawProjectiles() {
    this.projectiles.forEach(p => {
      this.ctx.save();
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = p.color;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    });
  }

  private drawParticles() {
    this.particles.forEach(p => {
      this.ctx.save();
      this.ctx.globalAlpha = p.alpha;

      if (p.type === 'lightning' && p.lightningPoints) {
        // Draw lightning bolts
        this.ctx.strokeStyle = p.color;
        this.ctx.lineWidth = 2.5;
        this.ctx.shadowBlur = 12;
        this.ctx.shadowColor = '#c084fc';
        this.ctx.beginPath();
        
        this.ctx.moveTo(p.lightningPoints[0].x, p.lightningPoints[0].y);
        for (let i = 1; i < p.lightningPoints.length; i++) {
          this.ctx.lineTo(p.lightningPoints[i].x, p.lightningPoints[i].y);
        }
        this.ctx.stroke();
      } else if (p.type === 'push' && p.lightningPoints) {
        // Draw push cone shockwave (stored in lightningPoints: [{ x: angle, y: radius }])
        const angle = p.lightningPoints[0].x;
        
        this.ctx.strokeStyle = p.color;
        this.ctx.lineWidth = 4;
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = p.color;
        
        const coneHalf = Math.PI / (1.5 + this.playerStats.voidPushLevel * 0.15);
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius, angle - coneHalf, angle + coneHalf);
        this.ctx.stroke();
      } else if (p.type === 'vortex') {
        // Pulsing dark hole vortex rendering
        const pulse = 1 + Math.sin(Date.now() * 0.01) * 0.1;
        const currentRad = p.radius * pulse;
        
        const grad = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, currentRad);
        grad.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
        grad.addColorStop(0.3, `rgba(88, 28, 135, ${p.alpha})`);
        grad.addColorStop(0.7, `rgba(124, 58, 237, ${p.alpha * 0.5})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, currentRad, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Draw spiral arm effect
        this.ctx.strokeStyle = `rgba(139, 92, 246, ${p.alpha * 0.4})`;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, currentRad * 0.5, (Date.now() * 0.002) % (Math.PI * 2), ((Date.now() * 0.002) % (Math.PI * 2)) + Math.PI);
        this.ctx.stroke();
      } else if (p.type === 'vapor') {
        const grad = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
        grad.addColorStop(0, `rgba(239, 68, 68, ${p.alpha * 0.4})`);
        grad.addColorStop(0.5, `rgba(168, 85, 247, ${p.alpha * 0.2})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        this.ctx.fill();
      } else {
        // Standard circle particle
        this.ctx.fillStyle = p.color;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        this.ctx.fill();
      }

      this.ctx.restore();
    });
  }

  // Next.js State / Game Interaction Loop
  public start() {
    this.isPaused = false;
    this.isGameActive = true;
    audioManager.startSoundtrack();
    
    const loop = () => {
      if (!this.isGameActive) return;
      this.update();
      this.draw();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    
    this.animationFrameId = requestAnimationFrame(loop);
  }

  // Upgrades
  public getUpgradeOptions(): { id: string; name: string; description: string }[] {
    const list: { id: string; name: string; description: string }[] = [];

    // 1. Basic Stats (always available, but basic level increases)
    list.push({ id: 'health', name: 'Shadow Fortress', description: `Increases maximum Vitality by +25 (Level ${this.playerStats.healthLevel + 1}) and heals you.` });
    list.push({ id: 'energyRegen', name: 'Void Harmony', description: `Increases energy regeneration rate by +30% (Level ${this.playerStats.energyRegenLevel + 1}).` });

    // 2. Shadows Lightning
    if (this.playerStats.lightningLevel < 3) {
      list.push({ id: 'lightning', name: 'Stronger Lightning', description: `Increases Shadow Lightning level to ${this.playerStats.lightningLevel + 1}.` });
    }
    // Branching options (Lightning Level 2+)
    if (this.playerStats.lightningLevel >= 2) {
      if (!this.playerStats.lightningSlow) {
        list.push({ id: 'lightning_slow', name: 'Discharge Freeze', description: 'Shadow Lightning slows targets hit by 40% for 1.5s.' });
      }
      if (!this.playerStats.lightningChainCount) {
        list.push({ id: 'lightning_chain', name: 'Chain Resonance', description: 'Shadow Lightning chains to +2 additional targets.' });
      }
    }

    // 3. Void Push
    if (this.playerStats.voidPushLevel < 3) {
      list.push({ id: 'voidPush', name: 'Wider Void Push', description: `Increases Void Push level to ${this.playerStats.voidPushLevel + 1}.` });
    }
    // Branching options (Push Level 2+)
    if (this.playerStats.voidPushLevel >= 2) {
      if (!this.playerStats.vortexPush) {
        list.push({ id: 'push_vortex', name: 'Singularity Pulse', description: 'Void Push leaves a dark vortex that pulls in and ticks nearby enemies.' });
      }
      if (!this.playerStats.shatterCone) {
        list.push({ id: 'push_shatter', name: 'Shatter Blast', description: 'Void Push deals 2.5x damage to enemies slowed by lightning.' });
      }
    }

    // 4. Leap
    if (this.playerStats.leapLevel < 3) {
      list.push({ id: 'leap', name: 'Shorter Leap Cooldown', description: `Increases Leap level to ${this.playerStats.leapLevel + 1} and reduces cooldown.` });
    }
    // Branching options (Leap Level 2+)
    if (this.playerStats.leapLevel >= 2) {
      if (!this.playerStats.voidAegis) {
        list.push({ id: 'leap_shield', name: 'Void Shroud', description: 'Leaping grants you a temporary kinetic shield (absorbs 25 damage) upon landing.' });
      }
      if (!this.playerStats.vaporTrail) {
        list.push({ id: 'leap_trail', name: 'Brimstone Dash', description: 'Leap leaves a trail of damaging shadow vapor on the ground.' });
      }
    }

    // Return 3 random upgrades
    const shuffled = [...list].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
  }

  public applyUpgrade(upgradeId: string) {
    audioManager.playUpgrade();

    if (upgradeId === 'lightning') {
      this.playerStats.lightningLevel++;
      this.currentUpgradesSelected.push(`Stronger Lightning Lvl ${this.playerStats.lightningLevel}`);
    } else if (upgradeId === 'lightning_slow') {
      this.playerStats.lightningSlow = true;
      this.currentUpgradesSelected.push('Specialization: Discharge Freeze');
    } else if (upgradeId === 'lightning_chain') {
      this.playerStats.lightningChainCount = 2; // extra chains
      this.currentUpgradesSelected.push('Specialization: Chain Resonance');
    } else if (upgradeId === 'voidPush') {
      this.playerStats.voidPushLevel++;
      this.currentUpgradesSelected.push(`Wider Void Push Lvl ${this.playerStats.voidPushLevel}`);
    } else if (upgradeId === 'push_vortex') {
      this.playerStats.vortexPush = true;
      this.currentUpgradesSelected.push('Specialization: Singularity Pulse');
    } else if (upgradeId === 'push_shatter') {
      this.playerStats.shatterCone = true;
      this.currentUpgradesSelected.push('Specialization: Shatter Blast');
    } else if (upgradeId === 'leap') {
      this.playerStats.leapLevel++;
      this.playerStats.leapCooldown = Math.max(30, Math.floor(this.playerStats.leapCooldown * 0.8));
      this.currentUpgradesSelected.push(`Shorter Leap Cooldown Lvl ${this.playerStats.leapLevel}`);
    } else if (upgradeId === 'leap_shield') {
      this.playerStats.voidAegis = true;
      this.currentUpgradesSelected.push('Specialization: Void Shroud');
    } else if (upgradeId === 'leap_trail') {
      this.playerStats.vaporTrail = true;
      this.currentUpgradesSelected.push('Specialization: Brimstone Dash');
    } else if (upgradeId === 'health') {
      this.playerStats.healthLevel++;
      this.playerStats.maxHealth += 25;
      this.playerHealth = this.playerStats.maxHealth; // Full heal
      this.currentUpgradesSelected.push(`Shadow Fortress Lvl ${this.playerStats.healthLevel}`);
    } else if (upgradeId === 'energyRegen') {
      this.playerStats.energyRegenLevel++;
      this.currentUpgradesSelected.push(`Void Harmony Lvl ${this.playerStats.energyRegenLevel}`);
    }

    this.triggerStatsCallback();
  }

  // Mobile virtual movements
  public movePlayerMobile(dx: number, dy: number) {
    if (!this.isGameActive || this.isPaused || this.isLeaping) return;
    this.playerX += dx * this.playerStats.speed;
    this.playerY += dy * this.playerStats.speed;

    // Clamp
    this.playerX = Math.max(this.playerRadius, Math.min(this.arenaWidth - this.playerRadius, this.playerX));
    this.playerY = Math.max(this.playerRadius, Math.min(this.arenaHeight - this.playerRadius, this.playerY));
  }

  public aimPlayerMobile(dx: number, dy: number) {
    this.mouseX = this.playerX + dx * 100;
    this.mouseY = this.playerY + dy * 100;
  }

  public fireLightningMobile() {
    this.triggerShadowLightning();
  }

  public fireVoidPushMobile() {
    this.triggerVoidPush();
  }

  public fireLeapMobile() {
    this.triggerLeap();
  }

  // ==========================================
  // ENVIRONMENTAL STUFF (Walls, Hazards, Canisters)
  // ==========================================
  
  private generateWalls() {
    this.walls = [];
    if (this.wave < 10) return;

    // Room Layout 1 (Central pillars + barriers)
    // Left barrier
    this.walls.push({
      x: 350,
      y: 100,
      width: 30,
      height: 250
    });

    // Right barrier
    this.walls.push({
      x: 820,
      y: 550,
      width: 30,
      height: 250
    });

    // Center divider
    this.walls.push({
      x: 520,
      y: 420,
      width: 160,
      height: 60
    });
  }

  private generateHazards() {
    this.hazards = [];
    if (this.wave < 7) return; // Env hazards start at Wave 7+
    
    const numHazards = 3 + Math.floor(Math.random() * 3);
    
    for (let i = 0; i < numHazards; i++) {
      let hX = 150 + Math.random() * (this.arenaWidth - 350);
      let hY = 150 + Math.random() * (this.arenaHeight - 350);
      
      // Make sure it doesn't overlap player spawn or walls
      let attempts = 0;
      while ((Math.abs(hX - this.playerX) < 150 && Math.abs(hY - this.playerY) < 150) || 
             (this.isPositionInsideWall(hX + 20, hY + 20, 30) && attempts < 15)) {
        hX = 150 + Math.random() * (this.arenaWidth - 350);
        hY = 150 + Math.random() * (this.arenaHeight - 350);
        attempts++;
      }

      this.hazards.push({
        id: Math.random().toString(),
        x: hX,
        y: hY,
        width: 35 + Math.random() * 25, // Smaller hazards
        height: 35 + Math.random() * 25, // Smaller hazards
        damage: 0.20
      });
    }
  }

  private generateCanisters() {
    this.canisters = [];
    if (this.wave < 4) return; // Canisters start at Wave 4+
    
    const numCanisters = 3 + Math.floor(Math.random() * 2);
    
    for (let i = 0; i < numCanisters; i++) {
      let cX = 120 + Math.random() * (this.arenaWidth - 240);
      let cY = 120 + Math.random() * (this.arenaHeight - 240);
      
      // Make sure it doesn't overlap player spawn or walls
      let attempts = 0;
      while ((Math.abs(cX - this.playerX) < 100 && Math.abs(cY - this.playerY) < 100) || 
             (this.isPositionInsideWall(cX, cY, 15) && attempts < 15)) {
        cX = 120 + Math.random() * (this.arenaWidth - 240);
        cY = 120 + Math.random() * (this.arenaHeight - 240);
        attempts++;
      }

      this.canisters.push({
        id: Math.random().toString(),
        x: cX,
        y: cY,
        vx: 0,
        vy: 0,
        radius: 8, // Smaller radius
        isMoving: false
      });
    }
  }

  private isPositionInsideWall(x: number, y: number, radius: number): boolean {
    for (let i = 0; i < this.walls.length; i++) {
      const w = this.walls[i];
      const closestX = Math.max(w.x, Math.min(x, w.x + w.width));
      const closestY = Math.max(w.y, Math.min(y, w.y + w.height));
      const dx = x - closestX;
      const dy = y - closestY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius) return true;
    }
    return false;
  }

  private handleWallCollision(entity: { x: number; y: number; radius: number }, bounce: boolean = false, vxRef?: { vx: number }, vyRef?: { vy: number }) {
    this.walls.forEach(wall => {
      const closestX = Math.max(wall.x, Math.min(entity.x, wall.x + wall.width));
      const closestY = Math.max(wall.y, Math.min(entity.y, wall.y + wall.height));
      
      const dx = entity.x - closestX;
      const dy = entity.y - closestY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < entity.radius) {
        const overlap = entity.radius - dist;
        if (dist === 0) {
          entity.x += entity.radius;
          return;
        }

        const pushX = (dx / dist) * overlap;
        const pushY = (dy / dist) * overlap;
        
        entity.x += pushX;
        entity.y += pushY;

        if (bounce && vxRef && vyRef) {
          // Bounce off wall faces by flipping velocities
          if (Math.abs(closestX - wall.x) < 2 || Math.abs(closestX - (wall.x + wall.width)) < 2) {
            vxRef.vx *= -0.8;
          }
          if (Math.abs(closestY - wall.y) < 2 || Math.abs(closestY - (wall.y + wall.height)) < 2) {
            vyRef.vy *= -0.8;
          }
        }
      }
    });
  }

  private updateHazards() {
    this.hazards.forEach(h => {
      // Player damage tick
      if (this.playerX > h.x && this.playerX < h.x + h.width &&
          this.playerY > h.y && this.playerY < h.y + h.height) {
        this.damagePlayer(h.damage, 'contact');
        
        if (Math.random() < 0.1) {
          this.particles.push({
            id: Math.random().toString(),
            x: this.playerX + (Math.random() - 0.5) * 15,
            y: this.playerY + (Math.random() - 0.5) * 15,
            vx: (Math.random() - 0.5) * 1,
            vy: -Math.random() * 2,
            radius: 1.5,
            color: '#f97316',
            alpha: 0.8,
            decay: 0.05,
            type: 'spark'
          });
        }
      }

      // Enemies damage tick
      this.enemies.forEach(enemy => {
        if (enemy.x > h.x && enemy.x < h.x + h.width &&
            enemy.y > h.y && enemy.y < h.y + h.height) {
          enemy.health -= h.damage * 0.4;
          if (Math.random() < 0.05) {
            this.spawnHitParticles(enemy.x, enemy.y, '#f97316', 1);
          }
        }
      });
    });
  }

  private updateCanisters() {
    this.canisters = this.canisters.filter(c => {
      c.x += c.vx;
      c.y += c.vy;
      c.vx *= 0.95;
      c.vy *= 0.95;

      const speed = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
      if (speed < 0.1) {
        c.vx = 0;
        c.vy = 0;
        c.isMoving = false;
      }

      // Wall bounce collision
      const velX = { vx: c.vx };
      const velY = { vy: c.vy };
      this.handleWallCollision(c, true, velX, velY);
      c.vx = velX.vx;
      c.vy = velY.vy;

      c.x = Math.max(c.radius, Math.min(this.arenaWidth - c.radius, c.x));
      c.y = Math.max(c.radius, Math.min(this.arenaHeight - c.radius, c.y));

      // Player pushing canister
      const pDx = c.x - this.playerX;
      const pDy = c.y - this.playerY;
      const pDist = Math.sqrt(pDx * pDx + pDy * pDy);
      if (pDist < this.playerRadius + c.radius) {
        const pAngle = Math.atan2(pDy, pDx);
        const pushForce = 3;
        c.vx = Math.cos(pAngle) * pushForce;
        c.vy = Math.sin(pAngle) * pushForce;
        c.isMoving = true;
      }

      // Check enemy impacts when moving quickly
      if (speed > 3) {
        for (let i = 0; i < this.enemies.length; i++) {
          const enemy = this.enemies[i];
          const eDx = c.x - enemy.x;
          const eDy = c.y - enemy.y;
          const eDist = Math.sqrt(eDx * eDx + eDy * eDy);

          if (eDist < c.radius + enemy.radius) {
            this.triggerCanisterExplosion(c.x, c.y);
            return false; // remove canister
          }
        }
      }

      return true;
    });
  }

  private triggerCanisterExplosion(x: number, y: number) {
    this.screenShakeIntensity = Math.min(10, this.screenShakeIntensity + 5);
    
    // Spawn orange/red hit sparks
    this.spawnHitParticles(x, y, '#ef4444', 15);
    this.spawnHitParticles(x, y, '#f97316', 10);
    this.spawnHitParticles(x, y, '#fbbf24', 5);

    // Splash damage
    const splashRadius = 90;
    this.enemies.forEach(enemy => {
      const dx = enemy.x - x;
      const dy = enemy.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < splashRadius) {
        const damage = 65 * (1 - dist / splashRadius);
        enemy.health -= damage;
        
        const angle = Math.atan2(dy, dx);
        enemy.pushBackX = Math.cos(angle) * 9;
        enemy.pushBackY = Math.sin(angle) * 9;
        enemy.pushBackDuration = 15;
      }
    });
  }

  private drawWalls() {
    this.walls.forEach(w => {
      this.ctx.save();
      
      this.ctx.fillStyle = '#0b0f19';
      this.ctx.fillRect(w.x, w.y, w.width, w.height);
      
      this.ctx.strokeStyle = '#7c3aed';
      this.ctx.lineWidth = 3;
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = '#8b5cf6';
      this.ctx.strokeRect(w.x, w.y, w.width, w.height);
      
      this.ctx.strokeStyle = '#311059';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(w.x + 5, w.y + 5);
      this.ctx.lineTo(w.x + w.width - 5, w.y + w.height - 5);
      this.ctx.stroke();
      
      this.ctx.restore();
    });
  }

  private drawHazards() {
    this.hazards.forEach(h => {
      this.ctx.save();
      
      const pulse = 0.5 + Math.sin(Date.now() * 0.005) * 0.2;
      this.ctx.strokeStyle = `rgba(239, 68, 68, ${pulse})`;
      this.ctx.lineWidth = 2.5;
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = '#ef4444';
      
      this.ctx.strokeRect(h.x, h.y, h.width, h.height);
      
      this.ctx.fillStyle = `rgba(220, 38, 38, 0.06)`;
      this.ctx.fillRect(h.x, h.y, h.width, h.height);

      if (Math.random() < 0.05) {
        const fx = h.x + Math.random() * h.width;
        const fy = h.y + Math.random() * h.height;
        this.particles.push({
          id: Math.random().toString(),
          x: fx,
          y: fy,
          vx: 0,
          vy: -0.3 - Math.random() * 0.5,
          radius: 1 + Math.random() * 1.5,
          color: Math.random() < 0.5 ? '#f97316' : '#ef4444',
          alpha: 0.7,
          decay: 0.03,
          type: 'spark'
        });
      }
      
      this.ctx.restore();
    });
  }

  private drawCanisters() {
    this.canisters.forEach(c => {
      this.ctx.save();
      this.ctx.translate(c.x, c.y);

      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      this.ctx.beginPath();
      this.ctx.arc(0, 4, c.radius, 0, Math.PI * 2);
      this.ctx.fill();

      const grad = this.ctx.createLinearGradient(-c.radius, 0, c.radius, 0);
      grad.addColorStop(0, '#374151');
      grad.addColorStop(0.5, '#9ca3af');
      grad.addColorStop(1, '#1f2937');
      this.ctx.fillStyle = grad;
      
      this.ctx.beginPath();
      this.ctx.arc(0, 0, c.radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.strokeStyle = '#111827';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();

      this.ctx.fillStyle = '#c084fc';
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = '#a855f7';
      this.ctx.beginPath();
      this.ctx.arc(0, 0, c.radius * 0.4, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.restore();
    });
  }

  // ==========================================
  // MASTER COMPANION (Rule of Two AI)
  // ==========================================

  private updateMaster() {
    // 1. Hover AI Movement (Flanking hover near player)
    const hoverOffsetAngle = Date.now() * 0.0015;
    const targetX = this.playerX + Math.cos(hoverOffsetAngle) * 130;
    const targetY = this.playerY + Math.sin(hoverOffsetAngle) * 110 - 30;

    // Smooth lerp movement
    this.masterX += (targetX - this.masterX) * 0.05;
    this.masterY += (targetY - this.masterY) * 0.05;

    // 2. Decrement Intervention Cooldown
    if (this.masterInterventionCooldown > 0) {
      this.masterInterventionCooldown--;
    }

    // Overload Timer & Energy/Cooldown Acceleration
    if (this.masterOverloadTimer > 0) {
      this.masterOverloadTimer--;
      // Overload energy boost
      this.playerEnergy = Math.min(this.playerStats.maxEnergy, this.playerEnergy + 0.8);
      // Cooldown acceleration
      if (this.lightningTimer > 0) this.lightningTimer--;
      if (this.voidPushTimer > 0) this.voidPushTimer--;
      if (this.leapTimer > 0) this.leapTimer--;

      // Overload beam sparks
      if (Math.random() < 0.35) {
        this.particles.push({
          id: Math.random().toString(),
          x: this.playerX + (Math.random() - 0.5) * 20,
          y: this.playerY + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 2,
          vy: -Math.random() * 2,
          radius: 2,
          color: '#ef4444',
          alpha: 0.9,
          decay: 0.04,
          type: 'spark'
        });
      }
    }

    // Check Overload Trigger (Dark Rage Combo >= 15 or Boss trial)
    const isBossWave = this.wave % 3 === 0;
    if ((this.comboCount >= 15 || isBossWave) && this.masterOverloadTimer <= 0 && Math.random() < 0.02) {
      this.masterOverloadTimer = 180; // 3 seconds overload
      audioManager.playMasterOverload();
    }

    // 3. Shadow Tether (Suppression Link)
    if (this.masterTetherTimer > 0) {
      this.masterTetherTimer--;
    } else {
      this.castShadowTether();
    }

    // Update existing tethers
    this.tetherLinks = this.tetherLinks.filter(link => {
      link.duration--;
      const sourceEnemy = this.enemies.find(e => e.id === link.sourceEnemyId);
      const targetEnemy = this.enemies.find(e => e.id === link.targetEnemyId);
      if (!sourceEnemy || !targetEnemy || sourceEnemy.health <= 0 || targetEnemy.health <= 0) {
        return false;
      }
      // Apply slow to tethered enemies
      sourceEnemy.isSlowed = true;
      targetEnemy.isSlowed = true;
      return link.duration > 0;
    });
  }

  private castShadowTether() {
    if (this.enemies.length < 2) return;

    // Find enemies in range of Master
    const range = 420;
    const nearbyEnemies = this.enemies
      .map(e => {
        const dx = e.x - this.masterX;
        const dy = e.y - this.masterY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return { enemy: e, dist };
      })
      .filter(item => item.dist < range && item.enemy.health > 0)
      .sort((a, b) => a.dist - b.dist);

    if (nearbyEnemies.length >= 2) {
      this.masterTetherTimer = 240; // 4 seconds cooldown
      const source = nearbyEnemies[0].enemy;
      const targetCount = Math.min(3, nearbyEnemies.length);

      for (let i = 1; i < targetCount; i++) {
        const target = nearbyEnemies[i].enemy;
        this.tetherLinks.push({
          id: Math.random().toString(),
          sourceEnemyId: source.id,
          targetEnemyId: target.id,
          duration: 300 // 5 seconds duration
        });
      }

      audioManager.playMasterTether();
    }
  }

  public applySharedTetherDamage(enemyId: string, damage: number) {
    if (this.isSharingDamage || damage <= 0) return;
    this.isSharingDamage = true;

    const sharedAmount = damage * 0.5;

    this.tetherLinks.forEach(link => {
      let targetId: string | null = null;
      if (link.sourceEnemyId === enemyId) targetId = link.targetEnemyId;
      else if (link.targetEnemyId === enemyId) targetId = link.sourceEnemyId;

      if (targetId) {
        const target = this.enemies.find(e => e.id === targetId);
        if (target && target.health > 0) {
          target.health -= sharedAmount;
          this.spawnHitParticles(target.x, target.y, '#ef4444', 3);
        }
      }
    });

    this.isSharingDamage = false;
  }

  private triggerMasterIntervention() {
    this.masterInterventionCooldown = this.maxInterventionCooldown;
    
    // Teleport Master directly to Player
    this.masterX = this.playerX;
    this.masterY = this.playerY;

    // Restore health (+25 HP)
    const healAmount = 25;
    this.playerHealth = Math.min(this.playerStats.maxHealth, this.playerHealth + healAmount);

    // Repel all enemies & clear projectiles
    const pushForce = 18;
    this.enemies.forEach(enemy => {
      const dx = enemy.x - this.playerX;
      const dy = enemy.y - this.playerY;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      
      enemy.pushBackX = (dx / dist) * pushForce;
      enemy.pushBackY = (dy / dist) * pushForce;
      enemy.pushBackDuration = 25;
      enemy.health -= 35; // Intervention shockwave damage
    });

    // Destroy all hostile projectiles
    this.projectiles = this.projectiles.filter(p => p.owner !== 'enemy');

    audioManager.playMasterIntervention();
    this.screenShakeIntensity = 15;

    // Visual burst
    this.spawnHitParticles(this.playerX, this.playerY, '#ef4444', 30);
    this.spawnHitParticles(this.playerX, this.playerY, '#a855f7', 20);
  }

  private drawMaster() {
    // 1. Draw Tether Links between linked enemies
    this.tetherLinks.forEach(link => {
      const source = this.enemies.find(e => e.id === link.sourceEnemyId);
      const target = this.enemies.find(e => e.id === link.targetEnemyId);
      if (source && target) {
        this.ctx.save();
        this.ctx.strokeStyle = '#ef4444';
        this.ctx.lineWidth = 2;
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#dc2626';
        
        this.ctx.beginPath();
        this.ctx.moveTo(source.x, source.y);
        this.ctx.lineTo(target.x, target.y);
        this.ctx.stroke();

        // Energy knot at midpoint
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        this.ctx.fillStyle = '#f87171';
        this.ctx.beginPath();
        this.ctx.arc(midX, midY, 4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      }
    });

    // 2. Draw Overload Beam from Master to Player
    if (this.masterOverloadTimer > 0) {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      this.ctx.lineWidth = 4;
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = '#f87171';

      this.ctx.beginPath();
      this.ctx.moveTo(this.masterX, this.masterY);
      this.ctx.lineTo(this.playerX, this.playerY);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 3. Draw Master Entity
    this.ctx.save();
    this.ctx.translate(this.masterX, this.masterY);

    // Dark crimson radial aura
    const gradient = this.ctx.createRadialGradient(0, 0, 5, 0, 0, this.masterRadius * 2.2);
    gradient.addColorStop(0, 'rgba(220, 38, 38, 0.6)');
    gradient.addColorStop(0.6, 'rgba(126, 34, 206, 0.25)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, this.masterRadius * 2.2, 0, Math.PI * 2);
    this.ctx.fill();

    // Outer Mantle (Dark slate core)
    this.ctx.fillStyle = '#020617';
    this.ctx.beginPath();
    this.ctx.arc(0, 0, this.masterRadius, 0, Math.PI * 2);
    this.ctx.fill();

    // Mantle Trim (Deep red ring)
    this.ctx.strokeStyle = '#991b1b';
    this.ctx.lineWidth = 2.5;
    this.ctx.stroke();

    // Inner Hood Shadow
    this.ctx.fillStyle = '#000000';
    this.ctx.beginPath();
    this.ctx.arc(0, 0, this.masterRadius * 0.65, 0, Math.PI * 2);
    this.ctx.fill();

    // Face rotation towards player
    const angle = Math.atan2(this.playerY - this.masterY, this.playerX - this.masterX);
    this.ctx.rotate(angle);

    // Master Crimson Glowing Eyes
    this.ctx.fillStyle = '#f87171';
    this.ctx.shadowBlur = 8;
    this.ctx.shadowColor = '#ef4444';
    this.ctx.beginPath();
    this.ctx.arc(this.masterRadius * 0.35, -this.masterRadius * 0.22, 3, 0, Math.PI * 2);
    this.ctx.arc(this.masterRadius * 0.35, this.masterRadius * 0.22, 3, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }
}
