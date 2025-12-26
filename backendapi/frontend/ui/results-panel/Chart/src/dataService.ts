// Alpaca data service: websocket/polling abstraction
// Emits normalized candle ticks and signals
import { CandleTick, Signal, pushTick } from './store';
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
    pushTick(tick, signal);
  }
  private ws: WebSocket | null = null;
  private reconnectTimeout: any = null;
  private symbol: string = 'AAPL'; // Default symbol
  private alpacaKey: string = '';
  private alpacaSecret: string = '';

  connectAlpaca(key: string, secret: string, symbol: string = 'AAPL') {
    this.alpacaKey = key;
    this.alpacaSecret = secret;
    this.symbol = symbol;
    this.stopDemo();
    this.startAlpacaStream();
  }

  startAlpacaStream() {
    if (this.ws) this.ws.close();
    try {
      // Alpaca Market Data v2 WebSocket endpoint
      const url = 'wss://stream.data.alpaca.markets/v2/sip';
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        try {
          // Authenticate
          this.ws!.send(JSON.stringify({
            action: 'auth',
            key: this.alpacaKey,
            secret: this.alpacaSecret,
          }));
          // Subscribe to trades and bars for the symbol
          this.ws!.send(JSON.stringify({
            action: 'subscribe',
            trades: [this.symbol],
            bars: [this.symbol],
          }));
        } catch (err) {
          this.handleAlpacaError(err);
        }
      };
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (Array.isArray(msg)) {
            msg.forEach((item) => {
              if (item.T === 't') {
                // Trade tick
                const tick = {
                  timestamp: new Date(item.t).getTime(),
                  open: item.p,
                  high: item.p,
                  low: item.p,
                  close: item.p,
                  volume: item.s,
                };
                this.emitTick(tick);
              } else if (item.T === 'b') {
                // Bar (candle)
                const tick = {
                  timestamp: new Date(item.t).getTime(),
                  open: item.o,
                  high: item.h,
                  low: item.l,
                  close: item.c,
                  volume: item.v,
                };
                this.emitTick(tick);
              }
            });
          }
        } catch (err) {
          this.handleAlpacaError(err);
        }
      };
      this.ws.onclose = () => {
        this.ws = null;
        // Attempt reconnect after delay
        this.reconnectTimeout = setTimeout(() => this.startAlpacaStream(), 5000);
      };
      this.ws.onerror = (err) => {
        this.handleAlpacaError(err);
        if (this.ws) this.ws.close();
      };
    } catch (err) {
      this.handleAlpacaError(err);
    }
  }

  handleAlpacaError(err: any) {
    console.error('Alpaca WebSocket error:', err);
    // Fallback to demo data if Alpaca fails
    this.stopAlpacaStream();
    this.startDemo();
  }

  stopAlpacaStream() {
    if (this.ws) this.ws.close();
    this.ws = null;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
  }

  // ...existing code...
  private demoInterval: any = null;
  startDemo() {
    if (this.demoInterval) return;
    let t = Date.now() - 1000 * 60 * 60;
    let price = 100 + Math.random() * 10;
    this.demoInterval = setInterval(() => {
      t += 1000 * 60;
      const open = price;
      const close = open + (Math.random() - 0.5) * 2;
      const high = Math.max(open, close) + Math.random();
      const low = Math.min(open, close) - Math.random();
      const volume = Math.floor(100 + Math.random() * 100);
      price = close;
      const tick = { timestamp: t, open, high, low, close, volume };
      let signal = undefined;
      if (Math.random() < 0.08) {
        signal = { timestamp: t, type: Math.random() > 0.5 ? 'BUY' : 'SELL', value: close };
      }
      this.emitTick(tick, signal);
    }, 900);
  }
  stopDemo() {
    if (this.demoInterval) clearInterval(this.demoInterval);
    this.demoInterval = null;
  }
  start() {
    this.startDemo();
  }
  stop() {
    this.stopDemo();
    this.stopAlpacaStream();
  }
}
export const dataService = new DataService();
// Start demo data stream automatically
dataService.start();
