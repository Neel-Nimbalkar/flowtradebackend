// Alpaca data service: websocket/polling abstraction
// Emits normalized candle ticks and signals

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

// Simple event emitter
class DataService {
  private listeners: ((tick: CandleTick, signal?: Signal) => void)[] = [];

  subscribe(fn: (tick: CandleTick, signal?: Signal) => void) {
    this.listeners.push(fn);
    return () => this.unsubscribe(fn);
  }
  unsubscribe(fn: (tick: CandleTick, signal?: Signal) => void) {
    this.listeners = this.listeners.filter(l => l !== fn);
  }
  emitTick(tick: CandleTick, signal?: Signal) {
    this.listeners.forEach(fn => fn(tick, signal));
  }

  // Example: connect to Alpaca websocket or polling
  start() {
    // Replace with real Alpaca streaming/polling logic
    // On each tick, call this.emitTick(normalizedCandle, optionalSignal)
  }
  stop() {
    // Disconnect logic
  }
}

export const dataService = new DataService();
