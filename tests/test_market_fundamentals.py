def test_get_fundamentals_shapes_and_caches(temp_db, monkeypatch):
    from backend import market

    calls = {"n": 0}

    def fake_info(ticker):
        calls["n"] += 1
        return {
            "longName": "Apple Inc", "sector": "Technology",
            "industry": "Consumer Electronics", "marketCap": 3.0e12,
            "trailingPE": 30.0, "priceToBook": 45.0, "dividendYield": 0.005,
            "fiftyTwoWeekLow": 150.0, "fiftyTwoWeekHigh": 260.0, "currency": "USD",
        }

    monkeypatch.setattr(market, "_download_info", fake_info)

    d1 = market.get_fundamentals("AAPL")
    assert d1["name"] == "Apple Inc"
    assert d1["sector"] == "Technology"
    assert d1["market_cap"] == 3.0e12
    assert d1["available"] is True

    d2 = market.get_fundamentals("AAPL")   # cached within TTL
    assert calls["n"] == 1
    assert d2["pe"] == 30.0


def test_get_fundamentals_falls_back_to_stale_cache_on_failure(temp_db, monkeypatch):
    from backend import market

    # Cached row whose fetched_at is epoch 0 -> always past the TTL.
    temp_db.save_fundamentals("AAPL", {"ticker": "AAPL", "name": "Apple Inc",
                                       "sector": "Technology", "fetched_at": 0})

    def boom(ticker):
        raise RuntimeError("network down")

    monkeypatch.setattr(market, "_download_info", boom)
    d = market.get_fundamentals("AAPL")
    assert d["available"] is True          # stale cache still served
    assert d["name"] == "Apple Inc"


def test_get_quote_from_last_two_candles(temp_db, monkeypatch):
    from backend import market

    def fake_download(ticker, period="1y"):
        return [
            {"date": "2026-06-10", "open": 1, "high": 1, "low": 1, "close": 100.0, "volume": 1},
            {"date": "2026-06-11", "open": 1, "high": 1, "low": 1, "close": 110.0, "volume": 1},
        ]

    monkeypatch.setattr(market, "_download_history", fake_download)
    quote = market.get_quote("AAPL")
    assert quote["price"] == 110.0
    assert round(quote["change_pct"], 2) == 10.0
