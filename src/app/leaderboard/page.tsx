'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Trophy, ArrowLeft, Search, Calendar, User } from 'lucide-react';

interface HighScore {
  id: string;
  score: number;
  waveReached: number;
  createdAt: string;
  user: {
    username: string;
  };
}

export default function LeaderboardPage() {
  const [highScores, setHighScores] = useState<HighScore[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch high scores
  const fetchScores = async (usernameFilter: string = '') => {
    setLoading(true);
    try {
      const url = usernameFilter
        ? `/api/scores?limit=15&username=${encodeURIComponent(usernameFilter)}`
        : '/api/scores?limit=15';
      const response = await fetch(url);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch scores');
      }

      setHighScores(data.highScores || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setTimeout(() => {
      fetchScores();
    }, 0);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchScores(search.trim());
  };

  const handleClearSearch = () => {
    setSearch('');
    fetchScores('');
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-6 md:p-12 relative overflow-hidden">
      {/* Decorative glows */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-purple-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-indigo-900/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Navigation and Title */}
      <div className="max-w-4xl w-full mx-auto mb-8 z-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-purple-400 hover:text-purple-300 transition duration-150 mb-6 uppercase tracking-wider group"
        >
          <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" />
          Back to Temple Menu
        </Link>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-purple-900/20 pb-6">
          <div>
            <h2 className="text-xs font-semibold text-purple-500 uppercase tracking-[0.35em] mb-1">Hall of Shadows</h2>
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight flex items-center gap-2 select-none text-slate-100">
              <Trophy className="w-8 h-8 text-amber-500" />
              Leaderboard
            </h1>
            <p className="text-xs text-slate-400 mt-1">Record of apprentices who survived the longest in the master&apos;s chamber.</p>
          </div>

          {/* Search bar */}
          <form onSubmit={handleSearchSubmit} className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <input
                type="text"
                placeholder="Search initiate..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-900/80 border border-purple-950 focus:border-purple-600 outline-none text-xs text-slate-200 pl-8 pr-4 py-2.5 rounded-xl transition duration-150 font-medium placeholder-slate-700"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-[12px]" />
            </div>

            <button
              type="submit"
              className="bg-purple-900/60 hover:bg-purple-800 text-white px-4 py-2 rounded-xl text-xs font-semibold transition duration-150 active:scale-95"
            >
              Search
            </button>

            {search && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="bg-slate-800 hover:bg-slate-700 text-slate-400 px-3 py-2 rounded-xl text-xs font-semibold transition duration-150 active:scale-95"
              >
                Clear
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Main Leaderboard Table */}
      <div className="max-w-4xl w-full mx-auto bg-slate-900/40 backdrop-blur-xl border border-purple-900/30 rounded-2xl overflow-hidden shadow-2xl z-10 flex-1 flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-3">
            <div className="w-7 h-7 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500 font-mono">Querying database registers...</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center p-12 text-center">
            <p className="text-red-400 font-semibold text-sm">{error}</p>
          </div>
        ) : highScores.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500">
            <Trophy className="w-12 h-12 text-slate-700 mb-2 stroke-[1.5]" />
            <p className="text-sm font-semibold uppercase tracking-wider">No Records Found</p>
            <p className="text-xs text-slate-600 mt-1">No initiates have logged trial data under this search criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-purple-900/25 bg-purple-950/10">
                  <th className="py-4 px-6 text-[10px] font-semibold uppercase tracking-widest text-purple-400">Rank</th>
                  <th className="py-4 px-6 text-[10px] font-semibold uppercase tracking-widest text-purple-400">Apprentice</th>
                  <th className="py-4 px-6 text-[10px] font-semibold uppercase tracking-widest text-purple-400">Final Score</th>
                  <th className="py-4 px-6 text-[10px] font-semibold uppercase tracking-widest text-purple-400">Wave Reached</th>
                  <th className="py-4 px-6 text-[10px] font-semibold uppercase tracking-widest text-purple-400">Date Cleansed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-950/15">
                {highScores.map((scoreItem, index) => {
                  const date = new Date(scoreItem.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  });

                  // Styling for top 3 ranks
                  const isTop3 = index < 3;
                  const rankColors = [
                    'text-amber-400 font-black',
                    'text-slate-300 font-black',
                    'text-amber-700 font-black',
                  ];

                  return (
                    <tr
                      key={scoreItem.id}
                      className="hover:bg-purple-950/10 transition duration-150"
                    >
                      <td className="py-4 px-6 text-sm font-mono font-semibold">
                        <span className={isTop3 ? rankColors[index] : 'text-slate-500'}>
                          #{index + 1}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-sm font-bold text-slate-200">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-purple-500" />
                          {scoreItem.user.username}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-sm font-bold text-slate-100 font-mono">
                        {scoreItem.score.toLocaleString()}
                      </td>
                      <td className="py-4 px-6 text-sm font-medium text-purple-300 font-mono">
                        Wave {scoreItem.waveReached}
                      </td>
                      <td className="py-4 px-6 text-xs text-slate-500 font-medium">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {date}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
