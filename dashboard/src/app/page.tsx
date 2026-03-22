"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, Users, ShoppingCart, ArrowDownRight, Terminal,
  ArrowUpRight, Globe, Zap, ExternalLink
} from "lucide-react";

type Simulation = {
  id: number;
  target_url: string;
  num_agents: number;
  status: string;
  start_time: string;
  end_time: string | null;
  total_agents: number;
  purchases: number;
  bounces: number;
  conversion_rate: string;
};

export default function Home() {
  const router = useRouter();
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [targetUrl, setTargetUrl] = useState("https://example.com");
  const [numAgents, setNumAgents] = useState(10);
  const [showSuccess, setShowSuccess] = useState(false);

  const TIERS = [
    { label: "Small", count: 10, desc: "~2 min" },
    { label: "Medium", count: 50, desc: "~8 min" },
    { label: "Large", count: 100, desc: "~15 min" },
  ];

  const fetchData = () => {
    fetch("/api/simulations")
      .then(r => r.json())
      .then(data => { setSimulations(Array.isArray(data) ? data : []); setLoading(false); });
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const startSimulation = async () => {
    if (!targetUrl || triggering) return;
    setTriggering(true);
    try {
      await fetch("/api/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl, numAgents }),
      });
      setShowSuccess(true);
      setTimeout(() => { setShowSuccess(false); fetchData(); }, 3000);
    } catch (e) {
      console.error("Failed to trigger simulation", e);
    }
    setTriggering(false);
  };

  // Aggregate stats across all simulations
  const totalSimulations = simulations.length;
  const totalAgentsEver = simulations.reduce((a, s) => a + (s.total_agents ?? 0), 0);
  const bestConversion = simulations.length > 0
    ? Math.max(...simulations.map(s => parseFloat(s.conversion_rate) || 0)).toFixed(1) + '%'
    : 'N/A';

  return (
    <div className="min-h-screen text-white font-sans">

      {/* ── Hero Header ──────────────────────────────────────────────── */}
      <header className="border-b border-white/5 bg-[#080808]/80 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center animate-glow">
              <Activity className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight gradient-text">The Ghost Market</h1>
              <p className="text-xs text-gray-600">Synthetic Audience Sandbox</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-gray-400">Engine Online</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 space-y-10">

        {/* ── Hero Section ─────────────────────────────────────────────── */}
        <div className="text-center space-y-4 py-8 animate-fade-up">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-2">
            <div className="inline-flex items-center gap-2 text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-full">
              <Zap className="w-3 h-3" />
              AI-Powered Market Simulation
            </div>
            <div className="inline-flex items-center gap-2 text-xs text-sky-400 bg-sky-500/10 border border-sky-500/20 px-3 py-1.5 rounded-full shadow-[0_0_15px_rgba(56,189,248,0.15)]">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              Powered by Google Gemini
            </div>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight gradient-text leading-tight">
            Test Your Market<br />Before It&apos;s Real
          </h2>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            Drop in a URL. Watch 1,000 AI ghost consumers browse it, argue about it, and decide whether to buy — in under 60 minutes.
          </p>
        </div>

        {/* ── Global Stats Strip ───────────────────────────────────────── */}
        {totalSimulations > 0 && (
          <div className="grid grid-cols-3 gap-4 animate-fade-up" style={{ animationDelay: '0.1s' }}>
            {[
              { label: "Simulations Run", value: totalSimulations, icon: <Terminal className="w-4 h-4" />, color: "text-indigo-400", bg: "bg-indigo-500/10" },
              { label: "Total Agents Deployed", value: totalAgentsEver.toLocaleString(), icon: <Users className="w-4 h-4" />, color: "text-sky-400", bg: "bg-sky-500/10" },
              { label: "Best Conversion Seen", value: bestConversion, icon: <ArrowUpRight className="w-4 h-4" />, color: "text-emerald-400", bg: "bg-emerald-500/10" },
            ].map(stat => (
              <div key={stat.label} className="glass rounded-xl p-5">
                <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center ${stat.color} mb-3`}>
                  {stat.icon}
                </div>
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── New Simulation Panel ─────────────────────────────────────── */}
        <div className="glass rounded-2xl p-6 animate-fade-up" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-center gap-2 mb-5">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-gray-200">Launch New Simulation</h2>
          </div>

          <div className="grid md:grid-cols-[1fr_auto_auto] gap-3 items-end">
            {/* URL Input */}
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500 flex items-center gap-1.5">
                <Globe className="w-3 h-3" />
                Target URL
              </label>
              <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 focus-within:border-indigo-500/50 transition-colors">
                <input
                  id="target-url-input"
                  type="text"
                  value={targetUrl}
                  onChange={e => setTargetUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && startSimulation()}
                  placeholder="https://your-startup.com"
                  className="bg-transparent border-none outline-none text-sm text-white placeholder-gray-600 flex-1 min-w-0"
                />
              </div>
            </div>

            {/* Agent Tier */}
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500 flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                Swarm Size
              </label>
              <div className="flex gap-2">
                {TIERS.map(t => (
                  <button
                    key={t.label}
                    onClick={() => setNumAgents(t.count)}
                    className={`flex-1 py-2 px-2 rounded-lg border text-xs font-medium transition-all ${numAgents === t.count
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                      : 'bg-black/40 border-white/10 text-gray-400 hover:border-indigo-500/40 hover:text-gray-200'
                      }`}
                  >
                    <div>{t.label}</div>
                    <div className="text-gray-500 font-normal" style={{ fontSize: '10px' }}>{t.count} agents · {t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Launch Button */}
            <button
              id="launch-simulation-button"
              onClick={startSimulation}
              disabled={triggering || !targetUrl}
              className="h-[42px] bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold px-6 rounded-lg transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 flex items-center gap-2 whitespace-nowrap"
            >
              {triggering ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Spawning...
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  Run Simulation
                </>
              )}
            </button>
          </div>

          {showSuccess && (
            <div className="mt-3 flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Ghost swarm initiated — agents are browsing now
            </div>
          )}
        </div>

        {/* ── Simulations Table ────────────────────────────────────────── */}
        <div className="glass rounded-2xl overflow-hidden animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-200">Recent Simulation Runs</h2>
            {!loading && simulations.length > 0 && (
              <span className="text-xs text-gray-600">{simulations.length} total</span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-black/20 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="px-6 py-3.5 font-medium">ID / Target</th>
                  <th className="px-6 py-3.5 font-medium">Status</th>
                  <th className="px-6 py-3.5 font-medium">Agents</th>
                  <th className="px-6 py-3.5 font-medium">Conversions</th>
                  <th className="px-6 py-3.5 font-medium">Bounces</th>
                  <th className="px-6 py-3.5 font-medium text-right">Duration</th>
                  <th className="px-6 py-3.5 font-medium text-right">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-6 py-4">
                          <div className="h-4 shimmer rounded w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : simulations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <Terminal className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm">No simulations yet.</p>
                      <p className="text-gray-600 text-xs mt-1">Enter a URL above and click Run Simulation.</p>
                    </td>
                  </tr>
                ) : (
                  simulations.map(sim => {
                    const isRunning = !sim.end_time;
                    const duration = sim.end_time
                      ? Math.round((new Date(sim.end_time).getTime() - new Date(sim.start_time).getTime()) / 1000)
                      : null;
                    return (
                      <tr
                        key={sim.id}
                        className="hover:bg-white/[0.025] transition-colors cursor-pointer group"
                        onClick={() => router.push(`/simulation/${sim.id}`)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-white/5 border border-white/8 flex items-center justify-center font-mono text-xs text-gray-500 flex-shrink-0">
                              {sim.id}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-200 truncate max-w-[240px]">{sim.target_url}</p>
                              <p className="text-xs text-gray-600 mt-0.5">{new Date(sim.start_time).toLocaleString()}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {(() => {
                            const s = sim.status || (sim.end_time ? 'completed' : 'running');
                            if (s === 'running') return (
                              <span className="inline-flex items-center gap-1.5 text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                                In Progress
                              </span>
                            );
                            if (s === 'failed') return (
                              <span className="inline-flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                Failed
                              </span>
                            );
                            if (s === 'completed') return (
                              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full font-medium">
                                Completed
                              </span>
                            );
                            return (
                              <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full font-medium">
                                Idle
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 text-sm">
                            <Users className="w-3.5 h-3.5 text-gray-600" />
                            <span className="text-gray-200">{sim.total_agents ?? 0}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-medium text-emerald-400">{sim.conversion_rate}</span>
                          <span className="text-xs text-gray-600 ml-1.5">({sim.purchases ?? 0} buys)</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 text-sm">
                            <ArrowDownRight className="w-3.5 h-3.5 text-red-400" />
                            <span className="text-gray-300">{sim.bounces ?? 0}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm font-mono text-gray-500">
                            {duration ? `${duration}s` : '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1 text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ExternalLink className="w-3 h-3" />
                            View
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <footer className="pt-4 pb-8 text-center">
          <p className="text-sm font-semibold bg-gradient-to-r from-indigo-400 via-violet-400 to-sky-400 bg-clip-text text-transparent mb-1">
            Built by Jeevan Baliji
          </p>
          <p className="text-xs text-gray-600">
            Ghost Market v2.0 · Gemini 2.0 + Playwright · Synthetic Audience Intelligence
          </p>
          <div className="flex items-center justify-center gap-6 mt-3">
            {[
              { label: "Ghost Agents", value: "AI-Powered", color: "text-indigo-400" },
              { label: "Navigation", value: "Playwright", color: "text-sky-400" },
              { label: "Agent Brain & Reports", value: "Google Gemini 2.0 Flash", color: "text-violet-400" },
              { label: "Storage", value: "SQLite", color: "text-amber-400" },
            ].map(item => (
              <div key={item.label} className="text-center">
                <p className={`text-xs font-medium ${item.color}`}>{item.value}</p>
                <p className="text-xs text-gray-700">{item.label}</p>
              </div>
            ))}
          </div>
        </footer>

      </main>
    </div>
  );
}
