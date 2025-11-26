// Central reactive state store for chart and signals
export type CandleTick = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export type Signal = {
  timestamp: number;
  type: string;
  value?: any;
};
const BUFFER_LIMIT = 200;
export type StoreState = {
  priceData: CandleTick[];
  signals: Signal[];
};
const state: StoreState = {
  priceData: [],
  signals: [],
};
const listeners: (() => void)[] = [];
let lastUpdate = 0;
let scheduled = false;
export function subscribe(fn: () => void) {
  listeners.push(fn);
  return () => unsubscribe(fn);
}
export function unsubscribe(fn: () => void) {
  const i = listeners.indexOf(fn);
  if (i >= 0) listeners.splice(i, 1);
}
export function getState(): StoreState {
  return state;
}
export function pushTick(data: CandleTick, signal?: Signal) {
  state.priceData.push(data);
  if (state.priceData.length > BUFFER_LIMIT) state.priceData.shift();
  if (signal) {
    state.signals.push(signal);
    if (state.signals.length > BUFFER_LIMIT) state.signals.shift();
  }
  scheduleUpdate();
}
function scheduleUpdate() {
  if (scheduled) return;
  scheduled = true;
  const now = Date.now();
  const throttleMs = 150; // ~6 fps
  const delay = Math.max(0, throttleMs - (now - lastUpdate));
  setTimeout(() => {
    lastUpdate = Date.now();
    scheduled = false;
    listeners.forEach(fn => fn());
  }, delay);
}
