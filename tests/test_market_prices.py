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
