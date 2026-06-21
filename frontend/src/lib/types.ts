export interface Trade {
  uid: string;
  ticker: string;
  issuer_name: string;
  owner_name: string;
  owner_cik: string;
  roles: string;
  officer_title: string;
  code: string;
  action: string;
  kind: "buy" | "sell" | "grant" | "option" | "tax" | "gift" | "other";
  period: string;
  filed_at: string;
  shares: number | null;
  price: number | null;
  value: number | null;
  shares_after: number | null;
  is_derivative: number;
  line_count?: number;
  filing_url: string;
}

export interface Stats {
  days: number;
  buys_count: number; buys_value: number;
  sells_count: number; sells_value: number;
  net_value: number; total_count: number;
  top_buys: Trade[]; top_sells: Trade[];
  active: { ticker: string; issuer_name: string; n: number; buy_v: number; sell_v: number }[];
}

export interface Cluster {
  ticker: string; issuer_name: string; owners: number; trades: number;
  total_value: number; last_filed: string; names: string;
}

export interface Status {
  source: string; live_count: number; total_count: number;
  message: string; refreshing: boolean; last_success: string | null;
}

export interface Candle {
  date: string; open: number; high: number; low: number; close: number; volume: number;
}
export interface Marker {
  date: string; kind: "buy" | "sell"; price: number;
  owner_name: string; shares: number | null; value: number | null;
}
export interface Fundamentals {
  ticker: string;
  available: boolean;
  name?: string | null;
  sector?: string | null;
  industry?: string | null;
  market_cap?: number | null;
  pe?: number | null;
  pb?: number | null;
  dividend_yield?: number | null;
  week52_low?: number | null;
  week52_high?: number | null;
  currency?: string | null;
  fetched_at?: number | null;
}
export interface StockDetail {
  ticker: string;
  fundamentals: Fundamentals;
  prices: { ticker: string; available: boolean; candles: Candle[] };
  trades: Trade[];
  markers: Marker[];
  summary: { buys: number; sells: number; buy_value: number; sell_value: number;
             net_value: number; sell_alert: boolean };
}

export interface InsiderTrack {
  owner_cik: string; owner_name: string | null; n_buys: number;
  avg_ret_1m: number | null; avg_ret_3m: number | null; avg_ret_6m: number | null;
  win_rate: number | null; rating: number; sample_ok: number;
}

export interface Recommendation {
  ticker: string; issuer_name: string | null; owners: number;
  buy_value: number; market_cap: number | null; pe: number | null;
  score: number;
  subscores: { cluster: number; seniority: number; size: number;
               track: number; valuation: number };
  trades: Trade[];
}

export interface InsiderDetail {
  owner_cik: string;
  owner_name: string | null;
  roles: string | null;
  tickers: string[];
  trades: Trade[];
  summary: { buys: number; sells: number; buy_value: number;
             sell_value: number; net_value: number };
  track?: InsiderTrack | null;
}

export interface StrategyRule {
  name?: string;
  min_value?: number;
  roles?: string;
  min_cluster_owners?: number;
  hold_days?: number;
  days?: number;
}

export interface EquityPoint {
  date: string;
  value: number;
}

export interface BacktestResult {
  n_trades: number;
  win_rate: number;
  avg_return: number;
  avg_market_adjusted: number;
  total_return: number;
  benchmark_total_return: number;
  equity: EquityPoint[];
  benchmark: EquityPoint[];
  signals: number;
}

export interface Strategy {
  id: number;
  name: string;
  rule: StrategyRule;
  active: number;
  activated_at: string | null;
}

export interface SectorFlow {
  sector: string;
  buy_value: number;
  sell_value: number;
  net_value: number;
  tickers: number;
}

export interface WatchItem {
  kind: "ticker" | "insider";
  key: string;
  added_at: number;
}

export interface InsiderSummary {
  buys: number; sells: number;
  buy_value: number; sell_value: number;
  net_value: number; sell_alert: boolean;
}

export interface Holding {
  ticker: string;
  raw_ticker: string;
  is_us_equity: boolean;
  qty: number;
  avg_price: number;
  current_price: number;
  ppl?: number;
  insider: InsiderSummary | null;
}

export interface HoldingsResp {
  source: string;
  positions: Holding[];
}

export interface Digest {
  clusters: Cluster[];
  holdings_alerts: Holding[];
  watchlist_activity: Trade[];
}

export interface Scoreboard {
  strategy: Strategy | null;
  positions: Array<{
    id: number;
    strategy_id: number;
    ticker: string;
    opened_at: string;
    entry_price: number;
    shares: number;
    exit_at: string | null;
    exit_price: number | null;
    status: "open" | "closed";
    pnl: number | null;
  }>;
  open: number;
  closed: number;
  realized_pnl: number;
  win_rate: number | null;
}
