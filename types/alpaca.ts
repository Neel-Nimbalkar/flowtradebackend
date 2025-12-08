import { Block } from './types';

/**
 * Fetches historical price data from Alpaca Markets API.
 * Calculates indicators locally; does NOT use Alpaca for indicators.
 *
 * @param symbol Stock symbol (e.g., 'AAPL')
 * @param start ISO8601 start date (e.g., '2025-11-01T09:30:00-05:00')
 * @param end ISO8601 end date (e.g., '2025-11-14T16:00:00-05:00')
 * @param timeframe Bar timeframe (e.g., '1Hour', '1Day')
 * @returns Promise<number[]> array of close prices
 */
export async function getAlpacaPrices(
  symbol: string,
  start: string,
  end: string,
  timeframe: string = '1Hour'
): Promise<number[]> {
  // Use Alpaca Data API host (not paper trading host)
  const endpoint = `https://data.alpaca.markets/v2/stocks/${symbol}/bars`;
  const params = new URLSearchParams({
    start,
    end,
    timeframe,
    adjustment: 'raw',
    limit: '1000',
    feed: 'iex'
  });
  const url = `${endpoint}?${params.toString()}`;

  const headers = {
    'APCA-API-KEY-ID': 'PKMPVRKVFKFHFS72QZQQ2L57UN',
    'APCA-API-SECRET-KEY': '8tv1igKmQRLoA3gDvUem8DHw6QfxKss1EtkmDdpZuR5q',
    'Content-Type': 'application/json'
  };

  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    throw new Error(`Alpaca API error: ${resp.status} ${resp.statusText}`);
  }
  const data = await resp.json();
  if (!data.bars || !Array.isArray(data.bars)) {
    throw new Error('Alpaca response missing bars');
  }
  return data.bars.map((bar: any) => bar.c);
}
