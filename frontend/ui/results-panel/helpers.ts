export function formatNumber(n: number, digits = 2) {
  if (Number.isNaN(n)) return '—';
  return Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

export function formatMs(ms: number) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)} s`;
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(0);
  return `${m}m ${rem}s`;
}

export function formatTs(iso: string | number) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return String(iso);
  }
}

export function statusColor(status: string) {
  switch (status) {
    case 'passed':
    case 'completed':
      return 'text-emerald-400 border-emerald-500/20';
    case 'failed':
      return 'text-rose-400 border-rose-500/20';
    case 'skipped':
    case 'stopped':
      return 'text-slate-400 border-slate-500/20';
    default:
      return 'text-slate-300 border-slate-600/20';
  }
}

export function badgeBg(status: string) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-400/25';
    case 'stopped':
      return 'bg-amber-500/15 text-amber-300 border-amber-400/25';
    case 'failed':
      return 'bg-rose-500/15 text-rose-300 border-rose-400/25';
    default:
      return 'bg-slate-600/20 text-slate-300 border-slate-500/25';
  }
}

export function signalColors(signal: string) {
  switch (signal) {
    case 'BUY':
      return { ring: 'ring-emerald-500/30', text: 'text-emerald-300', bg: 'from-emerald-500/10 to-emerald-500/0' };
    case 'SELL':
      return { ring: 'ring-rose-500/30', text: 'text-rose-300', bg: 'from-rose-500/10 to-rose-500/0' };
    default:
      return { ring: 'ring-sky-500/30', text: 'text-sky-300', bg: 'from-sky-500/10 to-sky-500/0' };
  }
}

export function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
