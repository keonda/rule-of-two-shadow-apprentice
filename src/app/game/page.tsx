'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import GameCanvas from '@/components/GameCanvas';
import { PlayerStats } from '@/types/game';
import { Shield, Sparkles, Award, Play, Pause, RotateCcw, Home, Trophy, Volume2, VolumeX, Eye } from 'lucide-react';

export default function GamePage() {
  const router = useRouter();
  
  // User auth state
  const [user, setUser] = useState<{ id: string; username: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // HUD stats
  const [gameStats, setGameStats] = useState<PlayerStats | null>(null);
  const [health, setHealth] = useState(100);
  const [energy, setEnergy] = useState(100);
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Game UI flow states
  const [isPaused, setIsPaused] = useState(false);
  const [upgradeChoices, setUpgradeChoices] = useState<{ id: string; name: string; description: string }[] | null>(null);
  const [showTrialVictory, setShowTrialVictory] = useState(false);
  const [gameOverData, setGameOverData] = useState<{ score: number; wave: number; upgrades: string[] } | null>(null);

  // API Call state
  const [savingScore, setSavingScore] = useState(false);
  const [commentary, setCommentary] = useState<string>('');
  const [commentaryLoading, setCommentaryLoading] = useState(false);

  // Refs to control the canvas engine
  const applyUpgradeRef = useRef<((upgradeId: string) => void) | null>(null);
  const resumeNextWaveRef = useRef<(() => void) | null>(null);

  // Check auth
  useEffect(() => {
    const localUser = localStorage.getItem('shadow_apprentice_user');
    if (!localUser) {
      router.push('/');
    } else {
      try {
        const parsed = JSON.parse(localUser);
        setTimeout(() => {
          setUser(parsed);
          setAuthChecked(true);
        }, 0);
      } catch {
        router.push('/');
      }
    }
  }, [router]);

  // Audio manager toggle listener
  useEffect(() => {
    import('@/game/audio').then(({ audioManager }) => {
      audioManager.toggle(soundEnabled);
    });
  }, [soundEnabled]);

  if (!authChecked || !user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Handle stats callback from engine
  const handleGameStats = (
    stats: PlayerStats,
    currentHealth: number,
    currentEnergy: number,
    currentScore: number,
    currentWave: number
  ) => {
    setGameStats(stats);
    setHealth(currentHealth);
    setEnergy(currentEnergy);
    setScore(currentScore);
    setWave(currentWave);
  };

  // Wave complete -> Show upgrades
  const handleUpgradeChoice = (choices: { id: string; name: string; description: string }[]) => {
    setUpgradeChoices(choices);
  };

  // Boss trial cleared -> Celebrating
  const handleMasterTrialDefeated = () => {
    setShowTrialVictory(true);
    setTimeout(() => {
      setShowTrialVictory(false);
    }, 2000);
  };

  // Game over -> Save score & Query LLM
  const handleGameOver = async (finalScore: number, finalWave: number, selectedUpgrades: string[]) => {
    setGameOverData({ score: finalScore, wave: finalWave, upgrades: selectedUpgrades });
    setIsPaused(true);
    setSavingScore(true);
    setCommentaryLoading(true);

    try {
      // 1. Save session to Database
      const saveResponse = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          score: finalScore,
          waveReached: finalWave,
          selectedUpgrades,
          result: 'LOSS', // Always LOSS on Game Over
        }),
      });

      const saveData = await saveResponse.json();

      // 2. Request Groq Commentary
      const commResponse = await fetch('/api/commentary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: saveData.sessionId || undefined,
          triggerType: saveData.isNewRecord ? 'new_high_score' : 'game_over',
          score: finalScore,
          wave: finalWave,
          upgrades: selectedUpgrades,
        }),
      });

      const commData = await commResponse.json();
      setCommentary(commData.commentary);
    } catch (e) {
      console.error('Failed to post session/commentary data:', e);
      setCommentary('Your training has ended in shadow. Try again to claim your destiny.');
    } finally {
      setSavingScore(false);
      setCommentaryLoading(false);
    }
  };

  const handleSelectUpgrade = (upgradeId: string) => {
    if (applyUpgradeRef.current && resumeNextWaveRef.current) {
      applyUpgradeRef.current(upgradeId);
      setUpgradeChoices(null);
      resumeNextWaveRef.current();
    }
  };

  const handleRestart = () => {
    // Reload page to reinitialize canvas
    window.location.reload();
  };

  const togglePause = () => {
    setIsPaused(prev => !prev);
  };

  return (
    <main className="relative flex flex-col h-screen bg-slate-950 overflow-hidden select-none">
      
      {/* HEADER HUD BAR */}
      <div className="absolute top-0 inset-x-0 p-4 flex justify-between items-start z-20 pointer-events-none">
        
        {/* Left Side: Health & Energy */}
        <div className="flex flex-col gap-2 bg-slate-900/80 backdrop-blur-md p-3 rounded-xl border border-purple-900/20 pointer-events-auto min-w-[200px] md:min-w-[250px]">
          <div className="flex justify-between items-center text-xs font-semibold">
            <span className="text-purple-400 flex items-center gap-1 uppercase tracking-widest text-[10px]">
              <Eye className="w-3 h-3" /> {user.username}
            </span>
            <span className="text-slate-400 font-mono text-[10px]">HP: {Math.ceil(health)} / {gameStats?.maxHealth || 100}</span>
          </div>
          
          {/* Health Bar */}
          <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-red-600 to-red-500 h-full rounded-full transition-all duration-75"
              style={{ width: `${Math.max(0, Math.min(100, (health / (gameStats?.maxHealth || 100)) * 100))}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-xs font-semibold mt-1">
            <span className="text-indigo-400 uppercase tracking-widest text-[10px]">Void Energy</span>
            <span className="text-slate-400 font-mono text-[10px]">EN: {Math.ceil(energy)} / 100</span>
          </div>

          {/* Energy Bar */}
          <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-purple-600 to-indigo-500 h-full rounded-full transition-all duration-75"
              style={{ width: `${Math.max(0, Math.min(100, energy))}%` }}
            />
          </div>
        </div>

        {/* Right Side: Score & Wave */}
        <div className="flex gap-3 pointer-events-auto">
          {/* Wave Info */}
          <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-xl border border-purple-900/20 text-center min-w-[80px]">
            <p className="text-[10px] text-purple-400 uppercase font-semibold tracking-widest">Wave</p>
            <p className="text-xl font-bold text-slate-100 font-mono">{wave}</p>
          </div>

          {/* Score Info */}
          <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-xl border border-purple-900/20 text-center min-w-[120px]">
            <p className="text-[10px] text-purple-400 uppercase font-semibold tracking-widest">Score</p>
            <p className="text-xl font-bold text-slate-100 font-mono">{score}</p>
          </div>

          {/* Audio & Control Buttons */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 bg-slate-900/80 hover:bg-slate-800 backdrop-blur-md rounded-lg border border-purple-900/20 text-slate-300 transition duration-150 active:scale-95"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-purple-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            </button>

            <button
              onClick={togglePause}
              disabled={!!upgradeChoices || !!gameOverData}
              className="p-2 bg-slate-900/80 hover:bg-slate-800 backdrop-blur-md rounded-lg border border-purple-900/20 text-slate-300 transition duration-150 active:scale-95 disabled:opacity-50"
            >
              {isPaused ? <Play className="w-4 h-4 text-green-400" /> : <Pause className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* GAME CANVAS */}
      <div className="flex-1 w-full h-full">
        <GameCanvas
          isPaused={isPaused}
          onGameStats={handleGameStats}
          onUpgradeChoice={handleUpgradeChoice}
          onMasterTrialDefeated={handleMasterTrialDefeated}
          onGameOver={handleGameOver}
          applyUpgradeRef={applyUpgradeRef}
          resumeNextWaveRef={resumeNextWaveRef}
        />
      </div>

      {/* GAME RUNETIME OVERLAYS */}

      {/* 1. Trial Victory Celebration */}
      {showTrialVictory && (
        <div className="absolute inset-0 bg-purple-950/20 backdrop-blur-[1px] flex items-center justify-center z-30 pointer-events-none">
          <div className="text-center animate-bounce">
            <h2 className="text-purple-400 text-sm font-semibold tracking-[0.4em] uppercase mb-2">Master Trial</h2>
            <h1 className="text-4xl md:text-6xl font-black text-slate-100 tracking-wider uppercase drop-shadow-[0_0_15px_rgba(168,85,247,0.8)]">
              TRIAL SURVIVED
            </h1>
            <p className="text-slate-400 text-xs mt-2 font-mono">Absorbing master power matrix...</p>
          </div>
        </div>
      )}

      {/* 2. Upgrade Chooser Overlay */}
      {upgradeChoices && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-40">
          <div className="bg-slate-900 border border-purple-900/50 p-6 rounded-2xl w-full max-w-lg shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-purple-950 border border-purple-500/30 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-purple-400" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-100 uppercase tracking-wider">Choose Dark Blessing</h2>
            <p className="text-xs text-slate-400 mb-6 mt-1">Select one upgrade to manifest in your training</p>

            <div className="flex flex-col gap-3 text-left">
              {upgradeChoices.map((choice) => (
                <button
                  key={choice.id}
                  onClick={() => handleSelectUpgrade(choice.id)}
                  className="w-full bg-slate-950 hover:bg-purple-950/20 border border-slate-800 hover:border-purple-800/80 p-4 rounded-xl transition duration-150 active:scale-[0.99] group text-slate-200"
                >
                  <h4 className="font-bold text-sm text-purple-300 group-hover:text-purple-200 transition duration-150">
                    {choice.name}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">{choice.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. Pause Menu Overlay */}
      {isPaused && !upgradeChoices && !gameOverData && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-40 animate-fade-in">
          <div className="bg-slate-900 border border-purple-900/40 p-6 rounded-2xl w-full max-w-xs shadow-2xl text-center space-y-4">
            <h2 className="text-xl font-bold text-slate-100 uppercase tracking-widest">Training Paused</h2>
            
            <div className="flex flex-col gap-2">
              <button
                onClick={togglePause}
                className="w-full bg-purple-700 hover:bg-purple-600 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition duration-150"
              >
                <Play className="w-4 h-4" /> Resume
              </button>

              <button
                onClick={handleRestart}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition duration-150"
              >
                <RotateCcw className="w-4 h-4 text-purple-400" /> Restart
              </button>

              <Link
                href="/"
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition duration-150"
              >
                <Home className="w-4 h-4 text-indigo-400" /> Main Menu
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 4. Game Over Overlay */}
      {gameOverData && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-40 overflow-y-auto">
          <div className="bg-slate-900 border border-red-950/40 p-8 rounded-2xl w-full max-w-md shadow-2xl text-center my-8">
            <div className="w-12 h-12 rounded-full bg-red-950/50 border border-red-800/30 flex items-center justify-center mx-auto mb-3">
              <Shield className="w-6 h-6 text-red-500" />
            </div>
            
            <h2 className="text-2xl font-black text-red-500 uppercase tracking-wider">Spark Extinguished</h2>
            <p className="text-xs text-slate-400 mt-1">Your training session has ended.</p>

            {/* Score Breakdowns */}
            <div className="grid grid-cols-2 gap-3 my-6 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="text-center border-r border-slate-800">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Final Wave</p>
                <p className="text-2xl font-bold text-slate-100 font-mono mt-1">{gameOverData.wave}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Final Score</p>
                <p className="text-2xl font-bold text-slate-100 font-mono mt-1">{gameOverData.score}</p>
              </div>
            </div>

            {/* Selected Upgrades List */}
            {gameOverData.upgrades.length > 0 && (
              <div className="text-left mb-6">
                <p className="text-[10px] text-purple-400 uppercase font-semibold tracking-wider mb-2">Blessings Cleansed:</p>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(new Set(gameOverData.upgrades)).map((upg, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] bg-purple-950/40 border border-purple-900/30 text-purple-300 px-2 py-0.5 rounded"
                    >
                      {upg}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Groq LLM Commentary Verdict */}
            <div className="border-t border-slate-800/60 pt-5 text-left mb-6">
              <p className="text-[10px] text-purple-400 uppercase font-semibold tracking-widest mb-2.5 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5" /> Dark Master&apos;s Verdict:
              </p>

              {commentaryLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                  <div className="w-3.5 h-3.5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  <span>Consulting the shadow master...</span>
                </div>
              ) : (
                <div className="bg-purple-950/10 border-l-2 border-purple-500/80 p-3 rounded-r-lg">
                  <p className="text-xs text-slate-300 italic leading-relaxed">
                    &ldquo;{commentary}&rdquo;
                  </p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleRestart}
                disabled={savingScore}
                className="w-full bg-gradient-to-r from-purple-800 to-indigo-800 hover:from-purple-700 hover:to-indigo-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-1.5 transition duration-150 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" /> Train Again
              </button>

              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/leaderboard"
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 text-xs transition duration-150"
                >
                  <Trophy className="w-3.5 h-3.5 text-amber-400" /> Leaderboard
                </Link>

                <Link
                  href="/"
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 text-xs transition duration-150"
                >
                  <Home className="w-3.5 h-3.5" /> Main Menu
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
