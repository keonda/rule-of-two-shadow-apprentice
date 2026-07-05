'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Shield, Zap, Sparkles, BookOpen, Trophy, Swords, LogOut, User } from 'lucide-react';

export default function Home() {
  const [username, setUsername] = useState('');
  const [savedUser, setSavedUser] = useState<{ id: string; username: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  useEffect(() => {
    // Check if user is saved in localStorage
    const localUser = localStorage.getItem('shadow_apprentice_user');
    if (localUser) {
      try {
        const parsed = JSON.parse(localUser);
        setTimeout(() => {
          setSavedUser(parsed);
        }, 0);
      } catch {
        localStorage.removeItem('shadow_apprentice_user');
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Save user to state & localStorage
      localStorage.setItem('shadow_apprentice_user', JSON.stringify(data));
      setSavedUser(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('shadow_apprentice_user');
    setSavedUser(null);
    setUsername('');
  };

  return (
    <main className="relative min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 overflow-hidden">
      {/* Decorative Dark Particles/Runes in background */}
      <div className="absolute inset-0 pointer-events-none opacity-20 select-none">
        <div className="absolute top-[10%] left-[20%] text-purple-700 text-3xl rune-drift">▲</div>
        <div className="absolute top-[40%] left-[80%] text-purple-600 text-2xl rune-drift" style={{ animationDelay: '3s' }}>⛧</div>
        <div className="absolute top-[70%] left-[10%] text-purple-500 text-4xl rune-drift" style={{ animationDelay: '6s' }}>☯</div>
        <div className="absolute top-[80%] right-[20%] text-purple-800 text-2xl rune-drift" style={{ animationDelay: '9s' }}>▼</div>
        <div className="absolute top-[30%] right-[40%] text-purple-700 text-3xl rune-drift" style={{ animationDelay: '12s' }}>⚡</div>
      </div>

      {/* Main Title Banner */}
      <div className="text-center mb-10 z-10">
        <h2 className="text-sm font-semibold tracking-[0.35em] text-purple-500 uppercase mb-2">The Dark Trial Awaits</h2>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight bg-gradient-to-r from-purple-500 via-indigo-400 to-purple-700 bg-clip-text text-transparent drop-shadow-lg uppercase select-none animate-pulse-glow">
          Rule of Two: <br className="md:hidden" />
          <span className="text-slate-100">Shadow Apprentice</span>
        </h1>
        <p className="mt-4 text-slate-400 max-w-md mx-auto text-sm md:text-base">
          A dark sci-fi training ground. Master shadow lightning, push back your rival acolytes, and face the final Master Trials.
        </p>
      </div>

      {/* Card Interface */}
      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-purple-900/40 p-8 rounded-2xl shadow-2xl shadow-purple-950/20 z-10">
        {savedUser ? (
          /* Logged In View */
          <div className="space-y-6">
            <div className="flex items-center gap-3 bg-purple-950/20 border border-purple-900/30 p-4 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-purple-900/50 flex items-center justify-center border border-purple-500/30">
                <User className="w-5 h-5 text-purple-300" />
              </div>
              <div>
                <p className="text-xs text-purple-400 uppercase tracking-widest font-semibold">Active Apprentice</p>
                <h3 className="font-bold text-lg text-slate-100">{savedUser.username}</h3>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Link
                href="/game"
                className="w-full bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white font-bold py-3.5 px-6 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20 border border-purple-500/20 transition duration-200 active:scale-[0.98]"
              >
                <Swords className="w-5 h-5" />
                Enter the Temple (Start)
              </Link>

              <button
                onClick={() => setShowHowToPlay(true)}
                className="w-full bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700/50 font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition duration-150"
              >
                <BookOpen className="w-5 h-5 text-purple-400" />
                How to Play
              </button>

              <Link
                href="/leaderboard"
                className="w-full bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700/50 font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition duration-150"
              >
                <Trophy className="w-5 h-5 text-amber-400" />
                View Leaderboard
              </Link>
            </div>

            <div className="border-t border-slate-800/60 pt-4 flex justify-end">
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition duration-150"
              >
                <LogOut className="w-3.5 h-3.5" />
                Change Profile
              </button>
            </div>
          </div>
        ) : (
          /* Registration Form */
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="username" className="block text-xs font-semibold text-purple-400 uppercase tracking-widest mb-2">
                Initiate Name
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter shadow moniker..."
                disabled={loading}
                className="w-full bg-slate-950 border border-purple-950 focus:border-purple-600 outline-none text-slate-200 px-4 py-3 rounded-xl transition duration-150 text-center font-medium placeholder-slate-700"
              />
              {error && <p className="text-red-500 text-xs mt-2 font-medium">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-800 to-indigo-900 hover:from-purple-700 hover:to-indigo-800 text-slate-200 font-bold py-3.5 px-6 rounded-xl flex items-center justify-center gap-2 border border-purple-900/50 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Shield className="w-5 h-5 text-purple-400" />
                  Initiate Trial Access
                </>
              )}
            </button>

            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => setShowHowToPlay(true)}
                className="text-xs text-purple-400/80 hover:text-purple-300 transition duration-150 underline underline-offset-4"
              >
                How to Play
              </button>
              <span className="text-slate-700">•</span>
              <Link
                href="/leaderboard"
                className="text-xs text-purple-400/80 hover:text-purple-300 transition duration-150 underline underline-offset-4"
              >
                Leaderboard
              </Link>
            </div>
          </form>
        )}
      </div>

      {/* How to Play Modal */}
      {showHowToPlay && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-purple-900/40 rounded-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto shadow-2xl">
            <h3 className="text-xl font-bold text-purple-300 border-b border-slate-800 pb-3 uppercase flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Apprentice Training Rules
            </h3>
            
            <div className="mt-4 space-y-4 text-sm text-slate-300">
              <div>
                <h4 className="font-semibold text-slate-100 flex items-center gap-1.5 mb-1 text-purple-400">
                  <Zap className="w-4 h-4" /> 1. Core Abilities
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li><strong className="text-purple-200">Shadow Lightning (Left Click)</strong>: Ranged targeted purple sparks. High DPS, consumes small energy.</li>
                  <li><strong className="text-purple-200">Void Push (Right Click / E)</strong>: Emits a front shockwave cone. Knocks back enemies, deflects enemy projectles, and deals moderate damage. Consumes medium energy.</li>
                  <li><strong className="text-purple-200">Leap (Spacebar)</strong>: Fast invulnerable dash in movement direction. Essential for escaping surrounding swarms. Consumes energy.</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-slate-100 flex items-center gap-1.5 mb-1 text-purple-400">
                  <Sparkles className="w-4 h-4" /> 2. The Rule of Two & Trials
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Survive waves of training drones and hostile acolytes. At the end of every <strong className="text-slate-200">3 waves</strong>, a powerful proxy representing the <strong className="text-slate-200">Master Trial</strong> will spawn. Defeat the boss to unlock the master&apos;s upgrade menu (Health boost, wider push, faster energy regen, etc.).
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-100 mb-1 text-purple-400">3. Keyboard controls</h4>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div>Move: <span className="text-slate-200 font-mono">WASD / Arrow Keys</span></div>
                  <div>Aim: <span className="text-slate-200 font-mono">Mouse Cursor</span></div>
                  <div>Lightning: <span className="text-slate-200 font-mono">Left Click</span></div>
                  <div>Void Push: <span className="text-slate-200 font-mono">Right Click / E</span></div>
                  <div>Leap Dash: <span className="text-slate-200 font-mono">Spacebar</span></div>
                  <div>Pause: <span className="text-slate-200 font-mono">Escape / P</span></div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowHowToPlay(false)}
                className="bg-purple-900/60 hover:bg-purple-800 text-white font-semibold px-5 py-2 rounded-xl transition duration-150"
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
