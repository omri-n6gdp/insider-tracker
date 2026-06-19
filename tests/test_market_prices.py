def test_get_prices_fetches_then_serves_from_cache(temp_db, monkeypatch):
    from backend import market

    calls = {"n": 0}

    def fake_download(ticker, period="1y"):
        calls["n"] += 1
        return [{"date": "2026-06-10", "open": 1.0, "high": 2.0, "low": 0.5,
                 "close": 1.5, "volume": 100}]

    monkeypatch.setattr(market, "_download_history", fake_download)

    first = market.get_prices("AAPL")
    assert first["available"] is True
    assert first["ticker"] == "AAPL"
    assert len(first["candles"]) == 1

    second = market.get_prices("AAPL")           # within TTL -> cached
    assert calls["n"] == 1                        # no second network call
    assert second["candles"][0]["close"] == 1.5


def test_get_prices_falls_back_to_stale_cache_on_fetch_failure(temp_db, monkeypatch):
    from backend import market

    temp_db.save_prices("AAPL", [{"date": "2026-06-10", "open": 1, "high": 1,
                                  "low": 1, "close": 50.0, "volume": 1}])
    temp_db.set_meta("prices_fetched:AAPL", 0)  # epoch 0 -> always expired

    def bad_download(ticker, period="1y"):
        raise RuntimeError("network down")

    monkeypatch.setattr(market, "_download_history", bad_download)
    result = market.get_prices("AAPL")
    assert result["available"] is True          # stale cache still usable
    assert result["candles"][0]["close"] == 50.0


def test_download_history_skips_nan_rows(monkeypatch):
    # yfinance returns NaN OHLC for the current partial trading day; those rows
    # must be dropped so the API never emits invalid JSON.
    import sys
    import types
    from backend import market

    class _Day:
        def strftime(self, fmt):
            return "2026-06-19"

    class _Hist:
        def iterrows(self):
            yield _Day(), {"Open": 1.0, "High": 2.0, "Low": 0.5,
                           "Close": 1.5, "Volume": 100}
            yield _Day(), {"Open": float("nan"), "High": float("nan"),
                           "Low": float("nan"), "Close": float("nan"),
                           "Volume": 0}

    class _Ticker:
        def __init__(self, sym):
            pass

        def history(self, period="1y", auto_adjust=False):
            return _Hist()

    fake_yf = types.ModuleType("yfinance")
    fake_yf.Ticker = _Ticker
    monkeypatch.setitem(sys.modules, "yfinance", fake_yf)

    out = market._download_history("AAPL")
    assert len(out) == 1                      # NaN row dropped
    assert out[0]["close"] == 1.5


def test_get_prices_normalises_ticker(temp_db, monkeypatch):
    from backend import market
    seen = {}

    def fake_download(ticker, period="1y"):
        seen["ticker"] = ticker
        return [{"date": "2026-06-10", "open": 1, "high": 1, "low": 1,
                 "close": 1, "volume": 1}]

    monkeypatch.setattr(market, "_download_history", fake_download)
    market.get_prices("brk.b")
    assert seen["ticker"] == "BRK-B"
