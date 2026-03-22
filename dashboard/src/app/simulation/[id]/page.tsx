"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft, Users, ShoppingCart, ArrowDownRight, Clock,
    ChevronDown, ChevronRight, Brain, AlertTriangle, CheckCircle,
    Timer, Zap, Globe, TrendingDown, BarChart2, Map
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type AgentLog = {
    id: number;
    session_id: number;
    step_number: number;
    thought_process: string;
    action: string;
    target: string;
    page_url: string;
    scroll_depth: number | null;
    action_success: number | null;
    duration_ms: number | null;
    timestamp: string;
};

type AgentSession = {
    id: number;
    agent_id: string;
    persona: string;
    final_status: string;
    logs: AgentLog[];
};

type LiveLog = {
    log_id: number;
    agent_id: string;
    persona: string;
    action: string;
    thought_process: string;
    target: string;
    page_url: string;
    timestamp: string;
};

type PersonaSegment = {
    label: string;
    total: number;
    conversions: number;
    bounces: number;
    conversionRate: string;
    bounceRate: string;
    avgSteps: number;
};

type PageJourney = { url: string; visits: number; bounces: number; conversions: number };

type SimDetail = {
    simulation: {
        id: number;
        target_url: string;
        num_agents: number;
        completed_agents: number;
        status: string;
        start_time: string;
        end_time: string | null;
        report_summary: string | null;
    };
    sessions: AgentSession[];
    stats: {
        total: number;
        conversions: number;
        bounces: number;
        timedOut: number;
        errors: number;
        conversionRate: string;
    };
    funnel: Record<string, number>;
    heatmap: Record<string, number>;
    personaSegments: PersonaSegment[];
    pageJourneys: PageJourney[];
    progress: { completed: number; total: number };
};

// ── Colour maps ───────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
    CONVERTED: { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: <CheckCircle className="w-3.5 h-3.5" />, label: "Converted" },
    BOUNCED: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", icon: <ArrowDownRight className="w-3.5 h-3.5" />, label: "Bounced" },
    TIMED_OUT: { color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", icon: <Timer className="w-3.5 h-3.5" />, label: "Timed Out" },
    ERROR: { color: "text-gray-400", bg: "bg-gray-500/10 border-gray-500/20", icon: <AlertTriangle className="w-3.5 h-3.5" />, label: "Error" },
    RUNNING: { color: "text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/20", icon: <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse inline-block" />, label: "Running" },
};

const ACTION_STYLES: Record<string, string> = {
    BUY: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    BOUNCE: "text-red-400 bg-red-500/10 border-red-500/20",
    CLICK: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    SCROLL_DOWN: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    READ: "text-gray-400 bg-gray-500/10 border-gray-500/20",
};

const ACTION_HEX: Record<string, string> = {
    READ: "#6b7280", SCROLL_DOWN: "#38bdf8", CLICK: "#818cf8", BUY: "#10b981", BOUNCE: "#ef4444",
};

// ── Sub-components ────────────────────────────────────────────────────────────

/** Animated fill progress bar */
function ProgressBar({ completed, total }: { completed: number; total: number }) {
    const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    return (
        <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-400">
                <span className="flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-indigo-400" />
                    Agent Progress
                </span>
                <span className="font-mono text-indigo-300">{completed} / {total} ({pct}%)</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                    className="h-full bg-gradient-to-r from-indigo-600 to-violet-500 rounded-full transition-all duration-700"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

/** SVG Donut */
function DonutChart({ conversions, bounces, timedOut, errors, total }: {
    conversions: number; bounces: number; timedOut: number; errors: number; total: number
}) {
    const R = 56, C = 2 * Math.PI * R;
    const segs = [
        { v: conversions, color: "#10b981" },
        { v: bounces, color: "#ef4444" },
        { v: timedOut, color: "#f59e0b" },
        { v: errors, color: "#6b7280" },
    ].filter(s => s.v > 0);
    let off = 0;
    const arcs = segs.map(s => {
        const dash = total > 0 ? (s.v / total) * C : 0;
        const arc = { ...s, dash, gap: C - dash, off };
        off += dash;
        return arc;
    });
    return (
        <div className="flex items-center gap-8">
            <div className="relative flex-shrink-0">
                <svg width="144" height="144" viewBox="0 0 144 144">
                    <circle cx="72" cy="72" r={R} fill="none" stroke="#1f2937" strokeWidth="20" />
                    {arcs.map((a, i) => (
                        <circle key={i} cx="72" cy="72" r={R} fill="none" stroke={a.color} strokeWidth="20"
                            strokeDasharray={`${a.dash} ${a.gap}`} strokeDashoffset={-a.off}
                            transform="rotate(-90 72 72)" style={{ transition: "stroke-dasharray .6s" }} />
                    ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold">{total}</span>
                    <span className="text-xs text-gray-500">agents</span>
                </div>
            </div>
            <div className="space-y-2">
                {[
                    { label: "Converted", value: conversions, color: "#10b981" },
                    { label: "Bounced", value: bounces, color: "#ef4444" },
                    { label: "Timed Out", value: timedOut, color: "#f59e0b" },
                    { label: "Error", value: errors, color: "#6b7280" },
                ].map(i => (
                    <div key={i.label} className="flex items-center gap-2 text-sm">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: i.color }} />
                        <span className="text-gray-400">{i.label}</span>
                        <span className="font-medium ml-auto pl-4">{i.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Action Funnel — horizontal SVG */
function ActionFunnel({ funnel }: { funnel: Record<string, number> }) {
    const stages = [
        { key: "Agents", value: (funnel.READ ?? 0) + (funnel.SCROLL_DOWN ?? 0) + (funnel.CLICK ?? 0) + (funnel.BUY ?? 0) + (funnel.BOUNCE ?? 0), color: "#6366f1" },
        { key: "Read", value: funnel.READ ?? 0, color: "#818cf8" },
        { key: "Scroll", value: funnel.SCROLL_DOWN ?? 0, color: "#38bdf8" },
        { key: "Click", value: funnel.CLICK ?? 0, color: "#a78bfa" },
        { key: "Converted", value: funnel.BUY ?? 0, color: "#10b981" },
    ];
    const max = stages[0]?.value || 1;
    return (
        <div className="space-y-3">
            {stages.map((s, i) => {
                const pct = Math.round((s.value / max) * 100);
                const drop = i > 0 ? stages[i - 1].value - s.value : 0;
                return (
                    <div key={s.key}>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-400">{s.key}</span>
                            <span className="font-mono text-gray-300">
                                {s.value}
                                {i > 0 && drop > 0 && (
                                    <span className="text-red-400 ml-2">−{drop}</span>
                                )}
                            </span>
                        </div>
                        <div className="h-5 bg-white/5 rounded relative overflow-hidden">
                            <div
                                className="h-full rounded transition-all duration-700"
                                style={{ width: `${pct}%`, background: s.color, opacity: 0.85 }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/** Action Heatmap — horizontal bar chart */
function ActionHeatmap({ heatmap }: { heatmap: Record<string, number> }) {
    const entries = Object.entries(heatmap).sort((a, b) => b[1] - a[1]);
    return (
        <div className="space-y-2.5">
            {entries.map(([action, pct]) => (
                <div key={action}>
                    <div className="flex justify-between text-xs mb-1">
                        <span className="font-mono text-gray-400">{action}</span>
                        <span className="font-mono text-gray-300">{pct}%</span>
                    </div>
                    <div className="h-4 bg-white/5 rounded overflow-hidden">
                        <div
                            className="h-full rounded transition-all duration-700"
                            style={{ width: `${pct}%`, background: ACTION_HEX[action] ?? "#6b7280", opacity: 0.8 }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

/** Live Agent Ticker */
function LiveTicker({ logs, isRunning }: { logs: LiveLog[]; isRunning: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (ref.current) ref.current.scrollTop = 0;
    }, [logs.length]);

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />}
                <span className="text-xs text-gray-500">{logs.length} events captured</span>
            </div>
            <div
                ref={ref}
                className="h-64 overflow-y-auto space-y-1.5 pr-1"
                style={{ scrollbarWidth: 'thin' }}
            >
                {logs.length === 0 ? (
                    <p className="text-xs text-gray-600 py-4 text-center">
                        {isRunning ? "Waiting for first agent to start…" : "No log entries."}
                    </p>
                ) : (
                    logs.map(log => (
                        <div key={log.log_id} className="flex items-start gap-2 text-xs group">
                            <span className={`font-mono px-1.5 py-0.5 rounded border flex-shrink-0 mt-0.5 ${ACTION_STYLES[log.action] ?? ACTION_STYLES.READ}`}>
                                {log.action}
                            </span>
                            <div className="flex-1 min-w-0">
                                <span className="text-indigo-400 font-medium">{log.agent_id}</span>
                                <span className="text-gray-600"> · </span>
                                <span className="text-gray-300">{log.thought_process}</span>
                            </div>
                            <span className="text-gray-700 flex-shrink-0 font-mono hidden group-hover:block">
                                {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SimulationDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [data, setData] = useState<SimDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [liveLogs, setLiveLogs] = useState<LiveLog[]>([]);
    const [liveCursor, setLiveCursor] = useState(0);
    const [expandedSessions, setExpandedSessions] = useState<Set<number>>(new Set());
    // Use the status field as source of truth (same as dashboard)
    // Fallback to end_time check for old rows without status
    const simStatus = data?.simulation?.status || (data?.simulation?.end_time ? 'completed' : 'running');
    const isRunning = simStatus === 'running';
    const isFailed  = simStatus === 'failed';

    // Main data fetch (every 5 s while running)
    const fetchMain = useCallback(() => {
        if (!params.id) return;
        fetch(`/api/simulations/${params.id}`)
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false); });
    }, [params.id]);

    // Live ticker poll (every 2 s while running)
    const fetchLive = useCallback(() => {
        if (!params.id) return;
        fetch(`/api/simulations/${params.id}/live?since=${liveCursor}`)
            .then(r => r.json())
            .then(({ logs }) => {
                if (logs && logs.length > 0) {
                    setLiveLogs(prev => [...logs.reverse(), ...prev].slice(0, 200));
                    setLiveCursor(logs[0].log_id);
                }
            });
    }, [params.id, liveCursor]);

    useEffect(() => {
        fetchMain();
        const mainI = setInterval(() => { fetchMain(); }, 5_000);
        return () => clearInterval(mainI);
    }, [fetchMain]);

    useEffect(() => {
        if (!isRunning && data !== null) return; // don't poll when done
        const tickI = setInterval(() => { fetchLive(); }, 2_000);
        return () => clearInterval(tickI);
    }, [fetchLive, isRunning, data]);

    const toggleSession = (id: number) => setExpandedSessions(prev => {
        const n = new Set(prev);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
    });

    // ── Loading / empty states ─────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="min-h-screen bg-[#080808] text-white flex items-center justify-center">
                <div className="text-center space-y-3">
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-gray-400 text-sm">Loading simulation telemetry…</p>
                </div>
            </div>
        );
    }

    if (!data?.simulation) {
        return (
            <div className="min-h-screen bg-[#080808] text-white flex items-center justify-center">
                <p className="text-gray-400">Simulation not found.</p>
            </div>
        );
    }

    const { simulation, sessions, stats, funnel, heatmap, personaSegments, pageJourneys, progress } = data;
    const duration = simulation.end_time
        ? Math.round((new Date(simulation.end_time).getTime() - new Date(simulation.start_time).getTime()) / 1000)
        : null;
    const reportSections = simulation.report_summary
        ? simulation.report_summary.split(/\n(?=##)/).filter(Boolean)
        : [];

    return (
        <div className="min-h-screen bg-[#080808] text-white font-sans">

            {/* ── Sticky Nav ──────────────────────────────────────────────────────── */}
            <header className="sticky top-0 z-10 border-b border-white/5 bg-[#080808]/90 backdrop-blur-xl px-6 py-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <button onClick={() => router.push("/")}
                        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm group">
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                        Dashboard
                    </button>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-600 font-mono">SIM-{simulation.id}</span>
                        {isRunning ? (
                            <span className="flex items-center gap-1.5 text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />In Progress
                            </span>
                        ) : isFailed ? (
                            <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />Failed
                            </span>
                        ) : (
                            <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                                <CheckCircle className="w-3 h-3" />Completed
                            </span>
                        )}
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">

                {/* ── Title ───────────────────────────────────────────────────────────── */}
                <div>
                    <h1 className="text-2xl font-bold mb-1">Simulation Report</h1>
                    <p className="text-gray-400 font-mono text-sm break-all">{simulation.target_url}</p>
                    <p className="text-gray-600 text-xs mt-1">{new Date(simulation.start_time).toLocaleString()}</p>
                </div>

                {/* ── Progress Bar (live only) ─────────────────────────────────────── */}
                {(isRunning || progress.completed < progress.total) && (
                    <div className="glass rounded-xl p-5">
                        <ProgressBar completed={progress.completed} total={progress.total} />
                    </div>
                )}

                {/* ── KPI Strip ───────────────────────────────────────────────────────── */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {[
                        { label: "Total Agents", value: stats.total, icon: <Users className="w-4 h-4" />, color: "text-indigo-400", bg: "bg-indigo-500/10" },
                        { label: "Total Steps", value: sessions.reduce((acc, s) => acc + s.logs.length, 0), icon: <Zap className="w-4 h-4" />, color: "text-violet-400", bg: "bg-violet-500/10" },
                        { label: "Conversion Rate", value: stats.conversionRate, icon: <ShoppingCart className="w-4 h-4" />, color: "text-emerald-400", bg: "bg-emerald-500/10" },
                        { label: "Hard Bounces", value: stats.bounces, icon: <ArrowDownRight className="w-4 h-4" />, color: "text-red-400", bg: "bg-red-500/10" },
                        { label: "Run Duration", value: duration ? `${duration}s` : "Live", icon: <Clock className="w-4 h-4" />, color: "text-amber-400", bg: "bg-amber-500/10" },
                    ].map(k => (
                        <div key={k.label} className="glass rounded-xl p-5">
                            <div className={`w-8 h-8 rounded-lg ${k.bg} flex items-center justify-center ${k.color} mb-3`}>{k.icon}</div>
                            <div className="text-2xl font-bold">{k.value}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
                        </div>
                    ))}
                </div>

                {/* ── Live Ticker + Donut (side by side) ──────────────────────────── */}
                <div className="grid md:grid-cols-2 gap-6">
                    <div className="glass rounded-xl p-6">
                        <div className="flex items-center gap-2 mb-5">
                            <Zap className="w-4 h-4 text-indigo-400" />
                            <h2 className="text-sm font-semibold text-gray-200">Live Agent Ticker</h2>
                            <span className="text-xs text-indigo-400/60 font-mono ml-2 hidden sm:inline">(Brain: Google Gemini)</span>
                            {isRunning && <span className="ml-auto text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full animate-pulse">Live</span>}
                        </div>
                        <LiveTicker logs={liveLogs} isRunning={isRunning} />
                    </div>

                    <div className="glass rounded-xl p-6">
                        <div className="flex items-center gap-2 mb-5">
                            <BarChart2 className="w-4 h-4 text-indigo-400" />
                            <h2 className="text-sm font-semibold text-gray-200">Outcome Distribution</h2>
                        </div>
                        <DonutChart
                            conversions={stats.conversions} bounces={stats.bounces}
                            timedOut={stats.timedOut} errors={stats.errors} total={stats.total}
                        />
                    </div>
                </div>

                {/* ── Funnel + Heatmap ────────────────────────────────────────────── */}
                <div className="grid md:grid-cols-2 gap-6">
                    <div className="glass rounded-xl p-6">
                        <div className="flex items-center gap-2 mb-5">
                            <TrendingDown className="w-4 h-4 text-indigo-400" />
                            <h2 className="text-sm font-semibold text-gray-200">Action Funnel</h2>
                        </div>
                        <ActionFunnel funnel={funnel} />
                    </div>

                    <div className="glass rounded-xl p-6">
                        <div className="flex items-center gap-2 mb-5">
                            <BarChart2 className="w-4 h-4 text-sky-400" />
                            <h2 className="text-sm font-semibold text-gray-200">Action Heatmap</h2>
                        </div>
                        <ActionHeatmap heatmap={heatmap} />
                    </div>
                </div>

                {/* ── Persona Segment Table ────────────────────────────────────────── */}
                <div className="glass rounded-xl overflow-hidden">
                    <div className="px-6 py-5 border-b border-white/5 flex items-center gap-2">
                        <Users className="w-4 h-4 text-violet-400" />
                        <h2 className="text-sm font-semibold text-gray-200">Persona Segment Analysis</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="bg-black/20 text-xs text-gray-500 uppercase tracking-wider">
                                    {["Segment", "Agents", "Conversion %", "Bounce %", "Avg Steps"].map(h => (
                                        <th key={h} className="px-6 py-3 font-medium">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04]">
                                {personaSegments.filter(s => s.total > 0).map((seg, i) => {
                                    const convNum = parseFloat(seg.conversionRate);
                                    const bounceNum = parseFloat(seg.bounceRate);
                                    const isTop = convNum === Math.max(...personaSegments.map(s => parseFloat(s.conversionRate)));
                                    const isWorst = bounceNum === Math.max(...personaSegments.map(s => parseFloat(s.bounceRate)));
                                    return (
                                        <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="px-6 py-3.5 text-gray-200 font-medium">{seg.label}</td>
                                            <td className="px-6 py-3.5 text-gray-400">{seg.total}</td>
                                            <td className="px-6 py-3.5">
                                                <span className={`font-medium ${isTop ? 'text-emerald-400' : 'text-gray-300'}`}>{seg.conversionRate}</span>
                                            </td>
                                            <td className="px-6 py-3.5">
                                                <span className={`font-medium ${isWorst && bounceNum > 0 ? 'text-red-400' : 'text-gray-300'}`}>{seg.bounceRate}</span>
                                            </td>
                                            <td className="px-6 py-3.5 font-mono text-gray-400">{seg.avgSteps}</td>
                                        </tr>
                                    );
                                })}
                                {personaSegments.every(s => s.total === 0) && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-gray-600 text-xs">
                                            Data populates as agents complete
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ── Page Journey Map ─────────────────────────────────────────────── */}
                {pageJourneys.length > 0 && (
                    <div className="glass rounded-xl overflow-hidden">
                        <div className="px-6 py-5 border-b border-white/5 flex items-center gap-2">
                            <Map className="w-4 h-4 text-sky-400" />
                            <h2 className="text-sm font-semibold text-gray-200">Page Journey Map</h2>
                            <span className="text-xs text-gray-600 ml-auto">{pageJourneys.length} unique pages</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="bg-black/20 text-xs text-gray-500 uppercase tracking-wider">
                                        {["Page URL", "Visits", "Bounces Here", "Conversions Here"].map(h => (
                                            <th key={h} className="px-6 py-3 font-medium">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.04]">
                                    {pageJourneys.map((j, i) => (
                                        <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="px-6 py-3.5">
                                                <div className="flex items-center gap-2">
                                                    <Globe className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
                                                    <span className="text-gray-300 font-mono text-xs truncate max-w-xs">{j.url}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3.5 text-gray-400">{j.visits}</td>
                                            <td className="px-6 py-3.5">
                                                <span className={j.bounces > 0 ? 'text-red-400 font-medium' : 'text-gray-600'}>{j.bounces}</span>
                                            </td>
                                            <td className="px-6 py-3.5">
                                                <span className={j.conversions > 0 ? 'text-emerald-400 font-medium' : 'text-gray-600'}>{j.conversions}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ── Agent Sessions ───────────────────────────────────────────────── */}
                <div className="glass rounded-xl overflow-hidden">
                    <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-gray-200">Agent Sessions</h2>
                        <span className="text-xs text-gray-600">{sessions.length} agents</span>
                    </div>
                    <div className="divide-y divide-white/5">
                        {sessions.map(session => {
                            const cfg = STATUS_CFG[session.final_status] ?? STATUS_CFG.RUNNING;
                            const expanded = expandedSessions.has(session.id);
                            return (
                                <div key={session.id}>
                                    <button onClick={() => toggleSession(session.id)}
                                        className="w-full px-6 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors text-left">
                                        <div className="w-7 h-7 rounded-md bg-black/30 border border-white/10 flex items-center justify-center flex-shrink-0">
                                            <span className="text-xs text-gray-500 font-mono">{session.id}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-200">{session.agent_id}</p>
                                            <p className="text-xs text-gray-500 truncate mt-0.5">{session.persona}</p>
                                        </div>
                                        <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border flex-shrink-0 ${cfg.color} ${cfg.bg}`}>
                                            {cfg.icon}{cfg.label}
                                        </span>
                                        <span className="text-xs text-gray-600 flex-shrink-0">{session.logs.length} steps</span>
                                        {expanded ? <ChevronDown className="w-4 h-4 text-gray-600" /> : <ChevronRight className="w-4 h-4 text-gray-600" />}
                                    </button>

                                    {expanded && (
                                        <div className="px-6 pb-5 bg-black/20">
                                            <div className="border border-white/5 rounded-lg overflow-hidden">
                                                <div className="px-4 py-2 bg-white/[0.02] border-b border-white/5">
                                                    <p className="text-xs text-gray-400 italic">{session.persona}</p>
                                                </div>
                                                {session.logs.length === 0 ? (
                                                    <p className="text-xs text-gray-600 p-4">No steps recorded yet.</p>
                                                ) : (
                                                    <div className="divide-y divide-white/5">
                                                        {session.logs.map(log => (
                                                            <div key={log.id} className="px-4 py-3 flex items-start gap-3">
                                                                <span className="text-xs text-gray-600 font-mono w-5 flex-shrink-0 mt-0.5">{log.step_number}</span>
                                                                <span className={`text-xs font-mono px-1.5 py-0.5 rounded border flex-shrink-0 mt-0.5 ${ACTION_STYLES[log.action] ?? ACTION_STYLES.READ}`}>
                                                                    {log.action}
                                                                </span>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-sm text-gray-300">{log.thought_process}</p>
                                                                    <div className="flex flex-wrap gap-3 mt-1">
                                                                        {log.target && <span className="text-xs text-gray-500">→ &quot;{log.target}&quot;</span>}
                                                                        {log.page_url && <span className="text-xs text-gray-700 font-mono truncate max-w-xs">{log.page_url}</span>}
                                                                        {log.scroll_depth != null && <span className="text-xs text-sky-700">↓{log.scroll_depth}%</span>}
                                                                        {log.action_success === 0 && <span className="text-xs text-red-700">click failed</span>}
                                                                        {log.duration_ms != null && <span className="text-xs text-gray-700 font-mono">{log.duration_ms}ms</span>}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── AI Analyst Report ────────────────────────────────────────────── */}
                {simulation.report_summary ? (
                    <div className="bg-gradient-to-br from-indigo-950/40 to-purple-950/20 border border-indigo-500/20 rounded-xl overflow-hidden">
                        <div className="px-6 py-5 border-b border-indigo-500/10 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                                <Brain className="w-4 h-4 text-indigo-400" />
                            </div>
                            <div>
                                <h2 className="text-sm font-semibold">AI Analyst Report</h2>
                                <p className="text-xs text-indigo-400/60">Powered by Google Gemini 2.0</p>
                            </div>
                        </div>
                        <div className="px-6 py-6 space-y-6">
                            {reportSections.length > 0
                                ? reportSections.map((sec, i) => {
                                    const lines = sec.split('\n').filter(Boolean);
                                    const heading = lines[0]?.replace(/^##\s*/, '');
                                    return (
                                        <div key={i}>
                                            <h3 className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-2">{heading}</h3>
                                            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{lines.slice(1).join('\n')}</p>
                                        </div>
                                    );
                                })
                                : <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{simulation.report_summary}</p>
                            }
                        </div>
                    </div>
                ) : isRunning ? (
                    <div className="glass rounded-xl p-8 text-center">
                        <Brain className="w-8 h-8 text-indigo-400/30 mx-auto mb-3" />
                        <p className="text-sm text-gray-500">AI Analyst Report appears once all agents complete.</p>
                    </div>
                ) : isFailed ? (
                    <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-8 text-center">
                        <AlertTriangle className="w-8 h-8 text-amber-400/60 mx-auto mb-3" />
                        <p className="text-sm text-amber-300 font-medium mb-1">AI Report Unavailable</p>
                        <p className="text-xs text-gray-500">The agent swarm ran but the Gemini report generation failed or timed out.<br/>All agent session data above is still valid.</p>
                    </div>
                ) : null}

            </main>
        </div>
    );
}
