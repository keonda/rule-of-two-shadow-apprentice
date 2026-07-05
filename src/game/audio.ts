// Procedural Audio Generator using Web Audio API

class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private enabled: boolean = true;

  // Soundtrack State
  private soundtrackActive: boolean = false;
  private currentWave: number = 1;
  private stepCount: number = 0;
  private nextStepTime: number = 0;
  private schedulerInterval: number | null = null;
  private bassSequence: number[] = [36, 36, 39, 36, 43, 43, 41, 39]; // MIDI C2, C2, Eb2, C2, G2, G2, F2, Eb2

  constructor() {
    // Initialized lazily on first user interaction to satisfy browser policies
  }

  private init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.3, this.ctx.currentTime); // Master volume at 30%
      this.masterGain.connect(this.ctx.destination);
    } catch {
      console.warn("Web Audio API not supported");
    }
  }

  toggle(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) {
      this.resume();
      if (this.soundtrackActive) {
        // Restart soundtrack if it was supposed to play
        this.soundtrackActive = false; // reset active flag to allow start
        this.startSoundtrack();
      }
    } else {
      // Pause soundtrack scheduling
      if (this.schedulerInterval !== null) {
        window.clearInterval(this.schedulerInterval);
        this.schedulerInterval = null;
      }
    }
  }

  private resume() {
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  // --- Dynamic Procedural Soundtrack Loop ---

  startSoundtrack() {
    if (!this.enabled) return;
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    if (this.soundtrackActive) return;
    this.soundtrackActive = true;
    this.stepCount = 0;
    this.nextStepTime = this.ctx.currentTime + 0.05;

    // Start scheduling interval
    if (this.schedulerInterval === null) {
      this.schedulerInterval = window.setInterval(() => {
        this.scheduler();
      }, 60); // Check every 60ms
    }
  }

  stopSoundtrack() {
    this.soundtrackActive = false;
    if (this.schedulerInterval !== null) {
      window.clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }

  setWave(wave: number) {
    this.currentWave = wave;
  }

  private scheduler() {
    if (!this.ctx || !this.masterGain || !this.soundtrackActive) return;

    const scheduleAheadTime = 0.15; // Schedule 150ms ahead

    while (this.nextStepTime < this.ctx.currentTime + scheduleAheadTime) {
      this.scheduleNote(this.stepCount, this.nextStepTime);
      this.advanceStep();
    }
  }

  private advanceStep() {
    if (!this.ctx) return;
    
    // Wave changes speed (tempo ranges from 98 to 125 BPM)
    const isBossTrial = this.currentWave % 3 === 0;
    const tempo = (isBossTrial ? 122 : 98) + Math.min(20, this.currentWave * 1.5);
    
    const secondsPerBeat = 60.0 / tempo;
    this.nextStepTime += 0.25 * secondsPerBeat; // 1/16 note steps

    this.stepCount = (this.stepCount + 1) % 16;
  }

  private scheduleNote(step: number, time: number) {
    if (!this.ctx || !this.masterGain) return;

    const isBossTrial = this.currentWave % 3 === 0;

    // 1. Kick drum (Steps 0, 4, 8, 12)
    if (step % 4 === 0) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(130, time);
      osc.frequency.exponentialRampToValueAtTime(35, time + 0.12);
      
      gain.gain.setValueAtTime(0.22, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
      
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.12);
    }

    // 2. Hi-Hat (Steps 2, 6, 10, 14)
    if (step % 4 === 2) {
      try {
        const bufferSize = this.ctx.sampleRate * 0.04;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.setValueAtTime(6500, time);
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.025, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
        
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        source.start(time);
        source.stop(time + 0.04);
      } catch {
        // buffer fail fallback
      }
    }

    // 3. Bass synth arpeggio (Even steps)
    if (step % 2 === 0) {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      const sequenceIndex = Math.floor(step / 2) % this.bassSequence.length;
      let midiNote = this.bassSequence[sequenceIndex];

      // Boss transpose: perfect fourth (+5 semitones) or minor seventh (+10 semitones) for tension
      if (isBossTrial) {
        midiNote += (sequenceIndex % 4 < 2) ? 5 : 10;
      }

      const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(freq, time);
      
      osc2.type = "sawtooth";
      osc2.frequency.setValueAtTime(freq * 1.008, time); // detune chorus effect

      filter.type = "lowpass";
      // Cutoff increases with wave (makes music brighter and harder!)
      const baseCutoff = 130 + Math.min(320, this.currentWave * 18);
      filter.frequency.setValueAtTime(baseCutoff * 3, time);
      filter.frequency.exponentialRampToValueAtTime(baseCutoff, time + 0.2);
      filter.Q.setValueAtTime(3, time);

      // Low volume for bass background
      const bassVolume = isBossTrial ? 0.12 : 0.06;
      gain.gain.setValueAtTime(bassVolume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc1.start(time);
      osc2.start(time);
      osc1.stop(time + 0.22);
      osc2.stop(time + 0.22);
    }
  }

  // --- Sound Effects ---

  playLightning() {
    if (!this.enabled) return;
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    
    // Create an oscillator for the crackle
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
    
    // Quick amplitude modulation for crackle feel
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playPush() {
    if (!this.enabled) return;
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    
    // Deep bass wave
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = "triangle";
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.4);
    
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(now);
    osc.stop(now + 0.4);

    // Noise component for whoosh
    try {
      const bufferSize = this.ctx.sampleRate * 0.4;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(200, now);
      filter.frequency.exponentialRampToValueAtTime(50, now + 0.4);
      
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.15, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      
      noise.start(now);
      noise.stop(now + 0.4);
    } catch {
      // Fallback if buffer creation fails
    }
  }

  playLeap() {
    if (!this.enabled) return;
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.25);
    
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(now);
    osc.stop(now + 0.25);
  }

  playHurt() {
    if (!this.enabled) return;
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.setValueAtTime(70, now + 0.1);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playEnemyHurt() {
    if (!this.enabled) return;
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = "triangle";
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.setValueAtTime(200, now + 0.05);
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playUpgrade() {
    if (!this.enabled) return;
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(300, now);
    osc1.frequency.exponentialRampToValueAtTime(600, now + 0.4);
    
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(450, now);
    osc2.frequency.exponentialRampToValueAtTime(900, now + 0.4);
    
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);
    
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.5);
    osc2.stop(now + 0.5);
  }

  playTrialSpawn() {
    if (!this.enabled) return;
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.linearRampToValueAtTime(120, now + 0.8);
    
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(now);
    osc.stop(now + 1.2);
  }

  playGameOver() {
    if (!this.enabled) return;
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    // Stop soundtrack when game over
    this.stopSoundtrack();

    const now = this.ctx.currentTime;
    const notes = [150, 130, 110, 80];
    
    notes.forEach((freq, index) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, now + index * 0.25);
      
      gain.gain.setValueAtTime(0.25, now + index * 0.25);
      gain.gain.linearRampToValueAtTime(0.01, now + index * 0.25 + 0.3);
      
      osc.connect(gain);
      gain.connect(this.masterGain!);
      
      osc.start(now + index * 0.25);
      osc.stop(now + index * 0.25 + 0.3);
    });
  }
}

export const audioManager = new AudioManager();
