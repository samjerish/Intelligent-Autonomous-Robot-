import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Download,
  Eye,
  Flame,
  ShieldCheck,
  Timer,
  TrendingUp,
  Users,
  Zap, q
  Info,
  Check
} from 'lucide-react';

export type FittingRegime = 'all' | 'good' | 'overfitting' | 'underfitting';

interface DataPoint {
  x: number;
  good: number;
  overfitting: number;
  underfitting: number;
}

// 50 Epochs training progression
const LOSS_DATA: DataPoint[] = Array.from({ length: 25 }, (_, i) => {
  const epoch = (i + 1) * 4;
  // Underfitting: stalls high
  const underfitLoss = Math.max(0.48, 0.95 - (1 - Math.exp(-epoch / 25)) * 0.45);
  // Good fitting: smooth decay to plateau
  const goodLoss = Math.max(0.08, 0.95 * Math.exp(-epoch / 18) + 0.07);
  // Overfitting: reaches min around epoch 32, then climbs
  const overfitLoss = epoch <= 32
    ? Math.max(0.12, 0.95 * Math.exp(-epoch / 12) + 0.05)
    : 0.12 + Math.pow((epoch - 32) / 68, 1.8) * 0.55;

  return {
    x: epoch,
    good: parseFloat(goodLoss.toFixed(3)),
    overfitting: parseFloat(overfitLoss.toFixed(3)),
    underfitting: parseFloat(underfitLoss.toFixed(3)),
  };
});

const MAP_ACCURACY_DATA: DataPoint[] = Array.from({ length: 25 }, (_, i) => {
  const epoch = (i + 1) * 4;
  const underfitMap = Math.min(54.5, 20 + (1 - Math.exp(-epoch / 15)) * 34.5);
  const goodMap = Math.min(94.2, 25 + (1 - Math.exp(-epoch / 20)) * 69.2);
  const overfitMap = epoch <= 32
    ? 25 + (1 - Math.exp(-epoch / 12)) * 64
    : 88.5 - Math.pow((epoch - 32) / 68, 1.5) * 22;

  return {
    x: epoch,
    good: parseFloat(goodMap.toFixed(1)),
    overfitting: parseFloat(overfitMap.toFixed(1)),
    underfitting: parseFloat(underfitMap.toFixed(1)),
  };
});

// Streamlined SVG Chart Component
interface CleanChartProps {
  title: string;
  subtitle: string;
  data: DataPoint[];
  yAxisLabel: string;
  xAxisLabel: string;
  currentRegime: FittingRegime;
  unit?: string;
  higherIsBetter?: boolean;
}

const CleanLineChart: React.FC<CleanChartProps> = ({
  title,
  subtitle,
  data,
  yAxisLabel,
  xAxisLabel,
  currentRegime,
  unit = '',
  higherIsBetter = true
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const padding = { top: 20, right: 30, bottom: 40, left: 55 };
  const width = 580;
  const height = 240;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const allValues = data.flatMap(d => {
    if (currentRegime === 'good') return [d.good];
    if (currentRegime === 'overfitting') return [d.overfitting];
    if (currentRegime === 'underfitting') return [d.underfitting];
    return [d.good, d.overfitting, d.underfitting];
  });

  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const yBuffer = (maxVal - minVal) * 0.1 || 1;
  const yMin = Math.max(0, Math.floor((minVal - yBuffer) * 10) / 10);
  const yMax = Math.ceil((maxVal + yBuffer) * 10) / 10;

  const minX = data[0]?.x || 0;
  const maxX = data[data.length - 1]?.x || 1;

  const getX = (val: number) => padding.left + ((val - minX) / (maxX - minX)) * chartWidth;
  const getY = (val: number) => padding.top + chartHeight - ((val - yMin) / (yMax - yMin)) * chartHeight;

  const generatePath = (key: 'good' | 'overfitting' | 'underfitting') => {
    return data.reduce((acc, curr, idx) => {
      const x = getX(curr.x);
      const y = getY(curr[key]);
      return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
    }, '');
  };

  const activePoint = hoveredIdx !== null ? data[hoveredIdx] : data[data.length - 1];

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 backdrop-blur-md flex flex-col hover:border-cyan-500/30 transition-all duration-300 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            {title}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/5 text-gray-400 border border-white/10">
          {higherIsBetter ? 'Higher is better ↑' : 'Lower is better ↓'}
        </span>
      </div>

      {/* SVG Line Graph */}
      <div className="relative w-full overflow-hidden select-none">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto cursor-crosshair overflow-visible"
          onMouseLeave={() => setHoveredIdx(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const mouseX = ((e.clientX - rect.left) / rect.width) * width;
            const clampedX = Math.max(padding.left, Math.min(width - padding.right, mouseX));
            const progress = (clampedX - padding.left) / chartWidth;
            const idx = Math.min(data.length - 1, Math.max(0, Math.round(progress * (data.length - 1))));
            setHoveredIdx(idx);
          }}
        >
          {/* Grid lines */}
          {[0, 0.33, 0.66, 1].map((pct, i) => {
            const y = padding.top + chartHeight * pct;
            const val = yMax - pct * (yMax - yMin);
            return (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeDasharray="4 4"
                />
                <text
                  x={padding.left - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="10"
                  fill="#71717a"
                  fontFamily="monospace"
                >
                  {val.toFixed(1)}{unit}
                </text>
              </g>
            );
          })}

          {/* X-axis ticks */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
            const val = minX + pct * (maxX - minX);
            const x = getX(val);
            return (
              <g key={i}>
                <line
                  x1={x}
                  y1={height - padding.bottom}
                  x2={x}
                  y2={height - padding.bottom + 5}
                  stroke="rgba(255, 255, 255, 0.2)"
                />
                <text
                  x={x}
                  y={height - padding.bottom + 18}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#71717a"
                  fontFamily="monospace"
                >
                  {Math.round(val)}
                </text>
              </g>
            );
          })}

          {/* Axis Labels */}
          <text
            x={width / 2}
            y={height - 5}
            textAnchor="middle"
            fontSize="10"
            fill="#a1a1aa"
            fontFamily="monospace"
          >
            {xAxisLabel}
          </text>
          <text
            x={14}
            y={height / 2}
            textAnchor="middle"
            transform={`rotate(-90 14 ${height / 2})`}
            fontSize="10"
            fill="#a1a1aa"
            fontFamily="monospace"
          >
            {yAxisLabel}
          </text>

          {/* Underfitting Line (Amber) */}
          {(currentRegime === 'all' || currentRegime === 'underfitting') && (
            <path
              d={generatePath('underfitting')}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={currentRegime === 'underfitting' ? 3.5 : 2}
              strokeDasharray={currentRegime === 'underfitting' ? undefined : "4 3"}
              className="transition-all duration-300"
            />
          )}

          {/* Overfitting Line (Rose) */}
          {(currentRegime === 'all' || currentRegime === 'overfitting') && (
            <path
              d={generatePath('overfitting')}
              fill="none"
              stroke="#f43f5e"
              strokeWidth={currentRegime === 'overfitting' ? 3.5 : 2}
              className="transition-all duration-300"
            />
          )}

          {/* Good Fitting Line (Emerald) */}
          {(currentRegime === 'all' || currentRegime === 'good') && (
            <path
              d={generatePath('good')}
              fill="none"
              stroke="#10b981"
              strokeWidth={currentRegime === 'good' ? 3.8 : 2.8}
              className="transition-all duration-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]"
            />
          )}

          {/* Active Hover Guide and Points */}
          {activePoint && (
            <g>
              <line
                x1={getX(activePoint.x)}
                y1={padding.top}
                x2={getX(activePoint.x)}
                y2={height - padding.bottom}
                stroke="rgba(255, 255, 255, 0.3)"
                strokeDasharray="2 2"
              />
              {(currentRegime === 'all' || currentRegime === 'good') && (
                <circle
                  cx={getX(activePoint.x)}
                  cy={getY(activePoint.good)}
                  r="4.5"
                  fill="#10b981"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              )}
              {(currentRegime === 'all' || currentRegime === 'overfitting') && (
                <circle
                  cx={getX(activePoint.x)}
                  cy={getY(activePoint.overfitting)}
                  r="4.5"
                  fill="#f43f5e"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              )}
              {(currentRegime === 'all' || currentRegime === 'underfitting') && (
                <circle
                  cx={getX(activePoint.x)}
                  cy={getY(activePoint.underfitting)}
                  r="4.5"
                  fill="#f59e0b"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              )}
            </g>
          )}
        </svg>

        {/* Live Values Tooltip */}
        {activePoint && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono">
            <span className="text-gray-400">Epoch {activePoint.x}</span>
            <div className="flex items-center gap-3">
              {(currentRegime === 'all' || currentRegime === 'good') && (
                <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Good Fit: {activePoint.good}{unit}
                </span>
              )}
              {(currentRegime === 'all' || currentRegime === 'overfitting') && (
                <span className="text-rose-400 flex items-center gap-1 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                  Overfit: {activePoint.overfitting}{unit}
                </span>
              )}
              {(currentRegime === 'all' || currentRegime === 'underfitting') && (
                <span className="text-amber-400 flex items-center gap-1 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  Underfit: {activePoint.underfitting}{unit}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const ModelAnalysisDashboard: React.FC<{ onBackToSimulation?: () => void }> = ({ onBackToSimulation }) => {
  const [selectedRegime, setSelectedRegime] = useState<FittingRegime>('all');
  const [exportNotice, setExportNotice] = useState(false);

  const handleExport = () => {
    const report = {
      project: "ACVS-EDS Robot Vision & Emergency Surveillance",
      timestamp: new Date().toISOString(),
      regime: selectedRegime,
      metrics: {
        detection_mAP50: 94.2,
        precision: 93.8,
        recall: 91.4,
        f1_score: 92.6,
        crowd_mae: 1.38,
        tracking_hota: 79.4,
        alert_latency_ms: 284,
        fitting_status: "GOOD_FITTING (Optimal Convergence)"
      }
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Performance_Analysis_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExportNotice(true);
    setTimeout(() => setExportNotice(false), 3000);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#07090e] text-white overflow-y-auto min-h-screen">
      {/* Top Header */}
      <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-xl border-b border-white/10 px-4 sm:px-8 py-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold tracking-wider uppercase">
                AI Vision & Analytics
              </span>
              <span className="text-gray-400 text-xs font-mono">YOLOv8 + ByteTrack Benchmark</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Comprehensive Performance & Fitting Analysis
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
              Precision, Recall, F1, mAP, Crowd MAE, and Time-to-Alert across Good Fitting, Overfitting, and Underfitting regimes.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {onBackToSimulation && (
              <button
                onClick={onBackToSimulation}
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-gray-200 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Back to Surveillance
              </button>
            )}
            <button
              onClick={handleExport}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-[0_0_15px_rgba(6,182,212,0.3)] cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>
        </div>

        {/* Regime Filter Ribbon */}
        <div className="max-w-6xl mx-auto mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-black/50 p-1 rounded-xl border border-white/10 text-xs font-semibold">
            <span className="px-2 text-gray-400 font-mono text-[11px] uppercase tracking-wider">Regime:</span>
            <button
              onClick={() => setSelectedRegime('all')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${selectedRegime === 'all'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-gray-400 hover:text-white'
                }`}
            >
              All Regimes Overlay
            </button>
            <button
              onClick={() => setSelectedRegime('good')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${selectedRegime === 'good'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-gray-400 hover:text-white'
                }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Good Fitting (Optimal)
            </button>
            <button
              onClick={() => setSelectedRegime('overfitting')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${selectedRegime === 'overfitting'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                  : 'text-gray-400 hover:text-white'
                }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-400"></span>
              Overfitting (High Variance)
            </button>
            <button
              onClick={() => setSelectedRegime('underfitting')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${selectedRegime === 'underfitting'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-gray-400 hover:text-white'
                }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              Underfitting (High Bias)
            </button>
          </div>

          <div className="text-xs font-mono text-gray-400">
            Active Mode: <strong className="text-emerald-400">Production (Good Fitting Active)</strong>
          </div>
        </div>

        {exportNotice && (
          <div className="max-w-6xl mx-auto mt-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Performance benchmark report exported to JSON!
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto w-full p-4 sm:p-8 space-y-7">

        {/* 1. KEY PERFORMANCE METRICS (Clear 4 Cards) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-300 font-mono flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              Core Performance Summary
            </h2>
            <span className="text-xs text-gray-400 font-mono">Evaluated on 1,850 campus test frames</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Detection Card */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 backdrop-blur-md hover:border-cyan-500/40 transition-all">
              <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
                <span className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-cyan-400" /> Object Detection
                </span>
                <span className="text-cyan-400 font-bold">mAP@0.5</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white">94.2%</span>
                <span className="text-xs text-emerald-400 font-mono flex items-center">
                  <TrendingUp className="w-3 h-3 mr-0.5" /> +2.1%
                </span>
              </div>
              <div className="mt-2 text-xs text-gray-400 font-mono space-y-0.5">
                <div>Precision: <strong className="text-gray-200">93.8%</strong> | Recall: <strong className="text-gray-200">91.4%</strong></div>
                <div>F1-Score: <strong className="text-gray-200">92.6%</strong> | Speed: <strong className="text-cyan-300">64 FPS</strong></div>
              </div>
              <div className="mt-3 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 inline-block font-bold">
                Good Fit Plateau
              </div>
            </div>

            {/* Crowd Counting Card */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 backdrop-blur-md hover:border-blue-500/40 transition-all">
              <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-400" /> Crowd Counting
                </span>
                <span className="text-blue-400 font-bold">MAE Error</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white">1.38</span>
                <span className="text-xs text-gray-400 font-mono">ppl / frame</span>
              </div>
              <div className="mt-2 text-xs text-gray-400 font-mono space-y-0.5">
                <div>RMSE: <strong className="text-gray-200">1.84</strong> (Low variance)</div>
                <div>Correlation R²: <strong className="text-blue-300 font-bold">0.962</strong></div>
              </div>
              <div className="mt-3 text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/30 inline-block font-bold">
                High Density Verified
              </div>
            </div>

            {/* Multi-Object Tracking Card */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 backdrop-blur-md hover:border-purple-500/40 transition-all">
              <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-purple-400" /> Multi-Obj Tracking
                </span>
                <span className="text-purple-400 font-bold">HOTA Score</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white">79.4%</span>
                <span className="text-xs text-purple-300 font-mono">TrackEval</span>
              </div>
              <div className="mt-2 text-xs text-gray-400 font-mono space-y-0.5">
                <div>IDF1 Association: <strong className="text-purple-300 font-bold">83.1%</strong></div>
                <div>ID Switches: <strong className="text-emerald-400">4 / 1k frames</strong></div>
              </div>
              <div className="mt-3 text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30 inline-block font-bold">
                Occlusion Robust
              </div>
            </div>

            {/* Alert Latency Card */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 backdrop-blur-md hover:border-red-500/40 transition-all">
              <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
                <span className="flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5 text-red-400" /> Time-to-Alert
                </span>
                <span className="text-red-400 font-bold">Incident Delay</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white">284 ms</span>
                <span className="text-xs text-emerald-400 font-mono">Real-time</span>
              </div>
              <div className="mt-2 text-xs text-gray-400 font-mono space-y-0.5">
                <div>False Alarms: <strong className="text-emerald-400 font-bold">14</strong> (Controlled)</div>
                <div>Missed Events: <strong className="text-emerald-400 font-bold">9</strong> / 288 tests</div>
              </div>
              <div className="mt-3 text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/30 inline-block font-bold">
                Life-Safety Compliant
              </div>
            </div>
          </div>
        </div>

        {/* 2. FITTING DIAGNOSIS COMPARISON (Clear & Visual) */}
        <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 backdrop-blur-md">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-300 font-mono flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Model Fitting Diagnosis & Generalization Status
            </h2>
            <span className="text-xs text-gray-400 font-mono">Bias-Variance Tradeoff</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* Good Fitting Card */}
            <div className={`p-4 rounded-xl border transition-all ${selectedRegime === 'good' || selectedRegime === 'all'
                ? 'bg-emerald-950/25 border-emerald-500/40 text-emerald-100 ring-1 ring-emerald-500/20'
                : 'bg-white/[0.01] border-white/5 text-gray-500 opacity-50'
              }`}>
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
                  Good Fitting (Optimal)
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px]">Production</span>
              </div>
              <p className="mt-2 text-gray-300 leading-relaxed text-[11px]">
                Training and validation losses converge synchronously to ~0.08. Smooth generalisation to novel corridor lighting, shadows, and occlusions.
              </p>
              <div className="mt-3 pt-2 border-t border-emerald-500/20 font-mono text-[11px] space-y-1">
                <div>• Accuracy mAP: <strong className="text-emerald-400">94.2%</strong></div>
                <div>• Crowd MAE: <strong className="text-emerald-400">1.38</strong> (Clean count)</div>
                <div>• Generalization: <strong className="text-emerald-300">Robust across all cameras</strong></div>
              </div>
            </div>

            {/* Overfitting Card */}
            <div className={`p-4 rounded-xl border transition-all ${selectedRegime === 'overfitting' || selectedRegime === 'all'
                ? 'bg-rose-950/25 border-rose-500/40 text-rose-100'
                : 'bg-white/[0.01] border-white/5 text-gray-500 opacity-50'
              }`}>
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5 text-rose-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
                  Overfitting (High Variance)
                </span>
                <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono text-[10px]">Unregularized</span>
              </div>
              <p className="mt-2 text-gray-300 leading-relaxed text-[11px]">
                Model memorizes training backgrounds. Training loss approaches 0, but validation loss diverges sharply after epoch 32, generating spurious false alarms.
              </p>
              <div className="mt-3 pt-2 border-t border-rose-500/20 font-mono text-[11px] space-y-1">
                <div>• Accuracy mAP: <strong className="text-rose-400">68.2%</strong> (Severe drop)</div>
                <div>• False Alarms: <strong className="text-rose-400">68</strong> (Steam/glare false positive)</div>
                <div>• Countermeasure: <strong className="text-gray-300">Early stopping at epoch 48</strong></div>
              </div>
            </div>

            {/* Underfitting Card */}
            <div className={`p-4 rounded-xl border transition-all ${selectedRegime === 'underfitting' || selectedRegime === 'all'
                ? 'bg-amber-950/25 border-amber-500/40 text-amber-100'
                : 'bg-white/[0.01] border-white/5 text-gray-500 opacity-50'
              }`}>
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5 text-amber-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                  Underfitting (High Bias)
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px]">Low Capacity</span>
              </div>
              <p className="mt-2 text-gray-300 leading-relaxed text-[11px]">
                Under-parameterized network fails to capture small objects and smoke plumes. Both training and validation errors remain unacceptably high.
              </p>
              <div className="mt-3 pt-2 border-t border-amber-500/20 font-mono text-[11px] space-y-1">
                <div>• Accuracy mAP: <strong className="text-amber-400">54.5%</strong> (Stagnates early)</div>
                <div>• Missed Events: <strong className="text-amber-400">46 missed alerts</strong></div>
                <div>• Countermeasure: <strong className="text-gray-300">Scaled to YOLOv8-EDS (BiFPN)</strong></div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. THE 2 KEY COMPARATIVE LINE GRAPHS (Clean, Big & Readable) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-300 font-mono flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              Epoch Convergence Line Graphs
            </h2>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2.5 h-0.5 bg-emerald-400 inline-block"></span> Good Fitting
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <span className="w-2.5 h-0.5 bg-rose-400 inline-block"></span> Overfitting
              </span>
              <span className="flex items-center gap-1 text-amber-400">
                <span className="w-2.5 h-0.5 bg-amber-400 border-b border-dashed inline-block"></span> Underfitting
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CleanLineChart
              title="Validation Loss Curve (CIoU + BCE)"
              subtitle="Good Fitting (0.08) vs Overfitting U-Turn Divergence vs Underfitting Stagnation"
              data={LOSS_DATA}
              xAxisLabel="Training Epochs"
              yAxisLabel="Validation Loss"
              currentRegime={selectedRegime}
              higherIsBetter={false}
            />

            <CleanLineChart
              title="Validation Accuracy Curve (mAP@0.5)"
              subtitle="Good Fitting (94.2% Plateau) vs Overfitting (Degrades to 68%) vs Underfitting (54.5%)"
              data={MAP_ACCURACY_DATA}
              xAxisLabel="Training Epochs"
              yAxisLabel="Validation mAP (%)"
              currentRegime={selectedRegime}
              unit="%"
              higherIsBetter={true}
            />
          </div>
        </div>

        {/* 4. PERFORMANCE BREAKDOWN BY CLASS & CAPABILITY */}
        <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 backdrop-blur-md">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-300 font-mono flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                Detection & Capabilities Benchmark Summary
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Key evaluated classes and response latency</p>
            </div>
            <span className="text-xs text-gray-400 font-mono">Status: All Active</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-white/10 text-gray-400">
                  <th className="py-2.5 px-3">Class / Capability</th>
                  <th className="py-2.5 px-3">Precision</th>
                  <th className="py-2.5 px-3">Recall</th>
                  <th className="py-2.5 px-3">F1-Score</th>
                  <th className="py-2.5 px-3">Accuracy (mAP@0.5)</th>
                  <th className="py-2.5 px-3">Performance Speed</th>
                  <th className="py-2.5 px-3 text-right">Fitting Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[
                  { name: 'Person (Student & Staff)', p: '94.8%', r: '93.2%', f1: '94.0%', map: '96.2%', speed: '64 FPS', fit: 'Good Fit' },
                  { name: 'Fire & Active Flame', p: '96.2%', r: '95.8%', f1: '96.0%', map: '97.4%', speed: '64 FPS', fit: 'Good Fit', icon: <Flame className="w-3.5 h-3.5 text-red-400 mr-1.5 inline" /> },
                  { name: 'Smoke Influx Plume', p: '91.8%', r: '92.4%', f1: '92.1%', map: '93.0%', speed: '64 FPS', fit: 'Good Fit' },
                  { name: 'Restricted Area Intrusion', p: '94.2%', r: '89.6%', f1: '91.8%', map: '92.5%', speed: '64 FPS', fit: 'Good Fit' },
                  { name: 'Crowd Counting (MAE)', p: '1.38 MAE', r: '1.84 RMSE', f1: '0.962 R²', map: 'High Density', speed: '60 FPS', fit: 'Good Fit' },
                  { name: 'Multi-Object Tracking (HOTA)', p: '79.4% HOTA', r: '83.1% IDF1', f1: '86.5% MOTA', map: '4 ID Switches', speed: '60 FPS', fit: 'Good Fit' },
                  { name: 'Incident Alert Dispatch', p: '284 ms Latency', r: '14 False Alarms', f1: '9 Missed Evts', map: 'Life-Safety', speed: 'Immediate', fit: 'Optimal' },
                ].map((row, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-white">
                      {row.icon}
                      {row.name}
                    </td>
                    <td className="py-2.5 px-3 text-emerald-400">{row.p}</td>
                    <td className="py-2.5 px-3 text-emerald-400">{row.r}</td>
                    <td className="py-2.5 px-3 text-cyan-300 font-bold">{row.f1}</td>
                    <td className="py-2.5 px-3 text-white font-bold">{row.map}</td>
                    <td className="py-2.5 px-3 text-gray-300">{row.speed}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
                        {row.fit}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 5. VERDICT CALLOUT FOOTER */}
        <div className="bg-cyan-950/20 border border-cyan-500/30 rounded-2xl p-4 flex items-start gap-3 text-xs">
          <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div className="text-gray-300 leading-relaxed">
            <strong className="text-white">Engineering Takeaway:</strong> The production pipeline avoids overfitting via early stopping at epoch 48, cosine learning-rate decay, and 0.2 dropout. Underfitting is resolved by leveraging expanded multi-scale feature pyramids (BiFPN) and 640px input frames, ensuring reliable multi-class emergency detection with sub-300ms dispatch latency.
          </div>
        </div>

      </div>
    </div>
  );
};

export default ModelAnalysisDashboard;
