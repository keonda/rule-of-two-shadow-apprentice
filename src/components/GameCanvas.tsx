'use client';

import React, { useEffect, useRef, useState } from 'react';
import { PlayerStats, MasterState } from '../types/game';
import { ShadowApprenticeGame } from '../game/engine';
import { Zap, Move, ShieldAlert, Award } from 'lucide-react';

interface GameCanvasProps {
  isPaused: boolean;
  onGameStats: (stats: PlayerStats, health: number, energy: number, score: number, wave: number, comboCount: number, masterState?: MasterState) => void;
  onUpgradeChoice: (choices: { id: string; name: string; description: string }[]) => void;
  onMasterTrialDefeated: () => void;
  onGameOver: (score: number, wave: number, upgrades: string[]) => void;
  applyUpgradeRef: React.MutableRefObject<((upgradeId: string) => void) | null>;
  resumeNextWaveRef: React.MutableRefObject<(() => void) | null>;
}

export default function GameCanvas({
  isPaused,
  onGameStats,
  onUpgradeChoice,
  onMasterTrialDefeated,
  onGameOver,
  applyUpgradeRef,
  resumeNextWaveRef
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<ShadowApprenticeGame | null>(null);
  
  // Mobile control touch state
  const joystickTouchRef = useRef<{ id: number; startX: number; startY: number } | null>(null);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);

  // Use refs to prevent callbacks from re-triggering the main game loop initialization
  const onGameStatsRef = useRef(onGameStats);
  const onUpgradeChoiceRef = useRef(onUpgradeChoice);
  const onMasterTrialDefeatedRef = useRef(onMasterTrialDefeated);
  const onGameOverRef = useRef(onGameOver);

  // Sync callbacks to refs on every render
  useEffect(() => {
    onGameStatsRef.current = onGameStats;
    onUpgradeChoiceRef.current = onUpgradeChoice;
    onMasterTrialDefeatedRef.current = onMasterTrialDefeated;
    onGameOverRef.current = onGameOver;
  });

  // Resize canvas handler
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        // Set canvas buffer sizes to container sizes
        const rect = canvasRef.current.parentElement?.getBoundingClientRect();
        canvasRef.current.width = rect?.width || 800;
        canvasRef.current.height = rect?.height || 600;
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    // Check if mobile device screen width
    setTimeout(() => {
      setIsMobile(window.innerWidth < 768);
    }, 0);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize game
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    
    // Create new game instance
    const game = new ShadowApprenticeGame(
      canvas,
      (stats, health, energy, score, wave, comboCount, masterState) => {
        onGameStatsRef.current(stats, health, energy, score, wave, comboCount, masterState);
      },
      () => {
        // Wave complete - trigger upgrade choice
        const choices = game.getUpgradeOptions();
        onUpgradeChoiceRef.current(choices);
        game.setPaused(true);
      },
      () => {
        // Master Trial Defeated!
        onMasterTrialDefeatedRef.current();
        // Wait 2.2s for effects before showing upgrades
        setTimeout(() => {
          if (!gameRef.current) return;
          const choices = gameRef.current.getUpgradeOptions();
          onUpgradeChoiceRef.current(choices);
          gameRef.current.setPaused(true);
        }, 2200);
      },
      (score, wave, upgrades) => {
        onGameOverRef.current(score, wave, upgrades);
      }
    );

    gameRef.current = game;
    game.start();

    // Wire up refs to let parent trigger upgrades
    applyUpgradeRef.current = (upgradeId: string) => {
      game.applyUpgrade(upgradeId);
    };

    resumeNextWaveRef.current = () => {
      game.setPaused(false);
      game.triggerNextWaveAfterUpgrade();
    };

    return () => {
      game.destroy();
      gameRef.current = null;
      applyUpgradeRef.current = null;
      resumeNextWaveRef.current = null;
    };
  }, [applyUpgradeRef, resumeNextWaveRef]);

  // Handle outside pause toggling
  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.setPaused(isPaused);
    }
  }, [isPaused]);

  // Mobile virtual joystick touch events
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (joystickTouchRef.current) return; // Only allow single touch joystick
    const touch = e.changedTouches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    joystickTouchRef.current = {
      id: touch.identifier,
      startX: touch.clientX - rect.left,
      startY: touch.clientY - rect.top
    };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!joystickTouchRef.current) return;
    const touch = Array.from(e.touches).find(t => t.identifier === joystickTouchRef.current?.id);
    if (!touch) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;

    const dx = touchX - joystickTouchRef.current.startX;
    const dy = touchY - joystickTouchRef.current.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxRadius = 40; // Max joystick pull distance

    let moveX = dx;
    let moveY = dy;

    if (dist > maxRadius) {
      moveX = (dx / dist) * maxRadius;
      moveY = (dy / dist) * maxRadius;
    }

    setJoystickPos({ x: moveX, y: moveY });

    // Send movement to game engine normalized
    if (gameRef.current) {
      const normX = moveX / maxRadius;
      const normY = moveY / maxRadius;
      gameRef.current.movePlayerMobile(normX, normY);
      gameRef.current.aimPlayerMobile(normX, normY); // Aim in moving direction on mobile
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!joystickTouchRef.current) return;
    const ended = Array.from(e.changedTouches).some(t => t.identifier === joystickTouchRef.current?.id);
    if (ended) {
      joystickTouchRef.current = null;
      setJoystickPos({ x: 0, y: 0 });
    }
  };

  // Mobile button triggers
  const handleMobileLightning = () => {
    if (gameRef.current) gameRef.current.fireLightningMobile();
  };

  const handleMobilePush = () => {
    if (gameRef.current) gameRef.current.fireVoidPushMobile();
  };

  const handleMobileLeap = () => {
    if (gameRef.current) gameRef.current.fireLeapMobile();
  };

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className="block bg-slate-900 border border-purple-900/50 shadow-2xl shadow-purple-950/20 max-w-full max-h-full cursor-crosshair rounded-lg"
      />

      {/* Mobile Virtual Controls */}
      {isMobile && (
        <div className="absolute inset-x-0 bottom-0 p-6 flex justify-between items-end pointer-events-none select-none">
          {/* Virtual Joystick */}
          <div
            className="w-28 h-28 bg-slate-900/60 backdrop-blur-md rounded-full border border-purple-500/30 flex items-center justify-center pointer-events-auto shadow-lg"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className="w-12 h-12 bg-purple-600/80 rounded-full border border-purple-400 flex items-center justify-center shadow-md transition-transform duration-75"
              style={{
                transform: `translate(${joystickPos.x}px, ${joystickPos.y}px)`
              }}
            >
              <Move className="w-5 h-5 text-white" />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 pointer-events-auto">
            {/* Leap / Dash */}
            <button
              onClick={handleMobileLeap}
              className="w-14 h-14 bg-blue-900/60 backdrop-blur-md border border-blue-500/40 rounded-full flex items-center justify-center active:scale-95 shadow-lg"
            >
              <ShieldAlert className="w-6 h-6 text-blue-300" />
            </button>

            {/* Void Push */}
            <button
              onClick={handleMobilePush}
              className="w-14 h-14 bg-indigo-900/60 backdrop-blur-md border border-indigo-500/40 rounded-full flex items-center justify-center active:scale-95 shadow-lg"
            >
              <Award className="w-6 h-6 text-indigo-300" />
            </button>

            {/* Lightning */}
            <button
              onClick={handleMobileLightning}
              className="w-16 h-16 bg-purple-900/80 backdrop-blur-md border-2 border-purple-500/60 rounded-full flex items-center justify-center active:scale-95 shadow-lg"
            >
              <Zap className="w-8 h-8 text-purple-200 fill-purple-400" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
