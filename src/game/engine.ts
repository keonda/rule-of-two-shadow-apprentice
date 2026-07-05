import { Enemy, EnemyType, Particle, PlayerStats, Projectile, Position } from '../types/game';
import { audioManager } from './audio';

export class ShadowApprenticeGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  
  // Callbacks
  private onStatsChange: (stats: PlayerStats, currentHealth: number, currentEnergy: number, score: number, wave: number) => void;
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
    onStatsChange: (stats: PlayerStats, currentHealth: number, currentEnergy: number, score: number, wave: number) => void,
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
      energyRegenLevel: 1
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
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.cleanupInput();
  }

  public setPaused(paused: boolean) {
    this.isPaused = paused;
  }

  // Wave Management
  private startWave() {
    this.enemies = [];
    this.projectiles = [];
    this.spawnTimer = 0;
    this.enemiesSpawned = 0;
    
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

  private triggerStatsCallback() {
    this.onStatsChange(
      this.playerStats,
      this.playerHealth,
      this.playerEnergy,
      this.score,
      this.wave
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
          
          const damage = 5 * this.playerStats.voidPushLevel;
          enemy.health -= damage;
          
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
    const bounceTargets = this.playerStats.lightningLevel; // level 1: 1 target, level 2: 2 targets, etc.

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

      // Apply damage
      enemy.health -= lightningDmg;

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
      // 30% chance for ranged drones starting wave 2
      if (this.wave > 1 && Math.random() < 0.3) {
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

    this.updatePlayerMovement();
    this.updateEnemies();
    this.updateProjectiles();
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

      // Check collision and damage enemies during leap
      const hitRadius = this.playerRadius + 15; // slightly wider hit zone
      const leapDmg = 25 * this.playerStats.leapLevel;
      
      this.enemies.forEach(enemy => {
        if (this.leapHitEnemies.has(enemy.id)) return;
        
        const dx = enemy.x - this.playerX;
        const dy = enemy.y - this.playerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < hitRadius + enemy.radius) {
          enemy.health -= leapDmg;
          this.leapHitEnemies.add(enemy.id);
          
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

      this.playerX += dx * this.playerStats.speed;
      this.playerY += dy * this.playerStats.speed;

      // Auto-fire Shadow Lightning when holding down left mouse click
      if (this.mouseClicked) {
        this.triggerShadowLightning();
      }
    }

    // Bound player to Arena
    this.playerX = Math.max(this.playerRadius, Math.min(this.arenaWidth - this.playerRadius, this.playerX));
    this.playerY = Math.max(this.playerRadius, Math.min(this.arenaHeight - this.playerRadius, this.playerY));
  }

  private updateEnemies() {
    this.enemies.forEach(enemy => {
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

      if (enemy.type === 'melee') {
        if (dist > 0) {
          enemy.x += (dx / dist) * enemy.speed;
          enemy.y += (dy / dist) * enemy.speed;
        }
      } else if (enemy.type === 'ranged') {
        // Keep distance (approx 200px)
        const targetDist = 220;
        if (dist > targetDist + 20) {
          enemy.x += (dx / dist) * enemy.speed;
          enemy.y += (dy / dist) * enemy.speed;
        } else if (dist < targetDist - 20) {
          enemy.x -= (dx / dist) * enemy.speed;
          enemy.y -= (dy / dist) * enemy.speed;
        }

        // Shoot projectile
        enemy.shootTimer++;
        if (enemy.shootTimer >= enemy.shootCooldown) {
          enemy.shootTimer = 0;
          this.shootEnemyProjectile(enemy, dx, dy);
        }
      } else if (enemy.type === 'boss') {
        // Boss AI
        enemy.bossSpecialTimer = (enemy.bossSpecialTimer || 0) + 1;
        
        // Boss moves towards player
        if (dist > 0) {
          enemy.x += (dx / dist) * enemy.speed;
          enemy.y += (dy / dist) * enemy.speed;
        }

        // Boss attacks every 3 seconds (180 frames)
        if (enemy.bossSpecialTimer >= 150) {
          enemy.bossSpecialTimer = 0;
          this.triggerBossAttack(enemy, dx, dy);
        }
      }

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

    // Remove off-screen or out-of-arena projectles
    this.projectiles = this.projectiles.filter(p => 
      p.x >= 0 && p.x <= this.arenaWidth && p.y >= 0 && p.y <= this.arenaHeight
    );
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
          this.damagePlayer(proj.damage);
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
        this.damagePlayer(enemy.damage * 0.05); // low contact damage per frame
        
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
        return false;
      }
      return true;
    });
  }

  private damagePlayer(amount: number) {
    if (this.playerInvulnTimer > 0) return;
    
    this.playerHealth -= amount;
    this.screenShakeIntensity = Math.min(10, this.screenShakeIntensity + amount * 0.4);
    
    audioManager.playHurt();

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
    this.drawParticles();
    this.drawProjectiles();
    this.drawEnemies();
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

      // Enemy base shadow/cloak
      this.ctx.fillStyle = enemy.color;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Cloak border
      this.ctx.strokeStyle = '#000000';
      this.ctx.lineWidth = 1.5;
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
      this.ctx.fillStyle = '#ef4444'; // Glowing red eyes for hostiles
      this.ctx.shadowBlur = 6;
      this.ctx.shadowColor = '#ef4444';

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
        this.ctx.arc(enemy.radius * 0.35, -enemy.radius * 0.25, 2, 0, Math.PI * 2);
        this.ctx.arc(enemy.radius * 0.35, enemy.radius * 0.25, 2, 0, Math.PI * 2);
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
    const list = [
      { id: 'lightning', name: 'Stronger Lightning', description: 'Deals +15% more damage and chains to 1 additional target.' },
      { id: 'voidPush', name: 'Wider Void Push', description: 'Increases shockwave push area, deflection force, and damage.' },
      { id: 'leap', name: 'Shorter Leap Cooldown', description: 'Decreases Leap recovery time by 20%.' },
      { id: 'health', name: 'Shadow Fortress', description: 'Increases maximum Vitality by +25 and heals you.' },
      { id: 'energyRegen', name: 'Void Harmony', description: 'Increases energy regeneration rate by +30%.' }
    ];
    
    // Return 3 random upgrades
    const shuffled = [...list].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
  }

  public applyUpgrade(upgradeId: string) {
    audioManager.playUpgrade();

    if (upgradeId === 'lightning') {
      this.playerStats.lightningLevel++;
      this.currentUpgradesSelected.push('Stronger Lightning');
    } else if (upgradeId === 'voidPush') {
      this.playerStats.voidPushLevel++;
      this.currentUpgradesSelected.push('Wider Void Push');
    } else if (upgradeId === 'leap') {
      this.playerStats.leapLevel++;
      this.playerStats.leapCooldown = Math.max(30, Math.floor(this.playerStats.leapCooldown * 0.8));
      this.currentUpgradesSelected.push('Shorter Leap Cooldown');
    } else if (upgradeId === 'health') {
      this.playerStats.healthLevel++;
      this.playerStats.maxHealth += 25;
      this.playerHealth = this.playerStats.maxHealth; // Full heal
      this.currentUpgradesSelected.push('Shadow Fortress');
    } else if (upgradeId === 'energyRegen') {
      this.playerStats.energyRegenLevel++;
      this.currentUpgradesSelected.push('Void Harmony');
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
}
