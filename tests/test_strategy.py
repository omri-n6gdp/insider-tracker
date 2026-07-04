from backend import strategy


def _sig(ticker, date, ret):
    """A signal plus a synthetic 200-day flat-then-jump price series so a
    hold of H days yields a known return."""
    import datetime as dt
    base = 100.0
    d = dt.date.fromisoformat(date)
    candles = []
    for i in range(200):
        px = base if i < 5 else base * (1 + ret)   # jumps after day 5
        candles.append({"date": (d + dt.timedelta(days=i)).isoformat(),
                        "open": px, "high": px, "low": px, "close": px, "volume": 1})
    return {"ticker": ticker, "date": date}, candles


def test_passes_filters():
    trade = {"kind": "buy", "code": "P", "value": 200000, "roles": "Officer",
             "officer_title": "CEO"}
    assert strategy.passes({"min_value": 100000}, trade)
    assert not strategy.passes({"min_value": 500000}, trade)
    assert strategy.passes({"roles": "officer"}, trade)
    assert not strategy.passes({"roles": "director"}, trade)


def test_backtest_metrics_and_benchmark():
    s1, c1 = _sig("AAA", "2026-01-01", 0.10)   # +10% after 5 days
    s2, c2 = _sig("BBB", "2026-02-01", -0.05)  # -5%
    prices = {"AAA": c1, "BBB": c2}
    # SPY flat -> market-adjusted == raw
    import datetime as dt
    spy = [{"date": (dt.date(2026, 1, 1) + dt.timedelta(days=i)).isoformat(),
            "open": 50, "high": 50, "low": 50, "close": 50, "volume": 1}
           for i in range(400)]
    res = strategy.backtest([s1, s2], prices, spy, hold_days=10)
    assert res["n_trades"] == 2
    assert round(res["avg_return"], 4) == round((0.10 - 0.05) / 2, 4)
    assert res["win_rate"] == 0.5
    assert len(res["equity"]) >= 2          # equity curve points
    assert "benchmark" in res                # SPY comparison series present


def test_backtest_skips_signals_without_prices():
    s1, _ = _sig("AAA", "2026-01-01", 0.1)
    res = strategy.backtest([s1], {}, [], hold_days=10)  # no price data
    assert res["n_trades"] == 0


class _FakeMarket:
    def get_prices(self, ticker, period="1y"):
        return {"candles": []}


def test_run_backtest_bounds_days_by_default(monkeypatch):
    """An unbounded (days=None) request must be clamped to a default window so
    it doesn't scan all history and trigger a yfinance fetch per unique ticker."""
    captured = {}
    def fake_signals(db_mod, rule, days=None):
        captured["days"] = days
        return []
    monkeypatch.setattr(strategy, "signals", fake_signals)
    strategy.run_backtest(None, _FakeMarket(), {}, days=None)
    assert captured["days"] == strategy.DEFAULT_BACKTEST_DAYS


def test_run_backtest_respects_explicit_days(monkeypatch):
    captured = {}
    def fake_signals(db_mod, rule, days=None):
        captured["days"] = days
        return []
    monkeypatch.setattr(strategy, "signals", fake_signals)
    strategy.run_backtest(None, _FakeMarket(), {}, days=30)
    assert captured["days"] == 30
