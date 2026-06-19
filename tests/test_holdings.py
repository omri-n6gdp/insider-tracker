def test_parse_position_us_vs_non_us():
    from backend import holdings
    us = holdings.parse_position({
        "ticker": "AAPL_US_EQ", "quantity": 3, "averagePrice": 150,
        "currentPrice": 200, "ppl": 150})
    assert us["ticker"] == "AAPL"
    assert us["is_us_equity"] is True

    lse = holdings.parse_position({
        "ticker": "VWRLl_EQ", "quantity": 10, "averagePrice": 1,
        "currentPrice": 1, "ppl": 0})
    assert lse["is_us_equity"] is False
    assert lse["ticker"] == "VWRLl_EQ"

    # Underscore inside the symbol part must survive (suffix-strip, not split).
    brk = holdings.parse_position({
        "ticker": "BRK_B_US_EQ", "quantity": 1, "averagePrice": 1,
        "currentPrice": 1, "ppl": 0})
    assert brk["is_us_equity"] is True
    assert brk["ticker"] == "BRK_B"


def test_auth_header_raw_key_when_no_secret(monkeypatch):
    from backend import holdings
    monkeypatch.setenv("TRADING212_API_KEY", "abc123")
    monkeypatch.delenv("TRADING212_API_SECRET", raising=False)
    assert holdings._auth_header() == "abc123"


def test_auth_header_basic_when_secret_present(monkeypatch):
    import base64
    from backend import holdings
    monkeypatch.setenv("TRADING212_API_KEY", "key")
    monkeypatch.setenv("TRADING212_API_SECRET", "secret")
    expected = "Basic " + base64.b64encode(b"key:secret").decode()
    assert holdings._auth_header() == expected


def test_auth_header_none_without_key(monkeypatch):
    from backend import holdings
    monkeypatch.delenv("TRADING212_API_KEY", raising=False)
    monkeypatch.delenv("TRADING212_API_SECRET", raising=False)
    assert holdings._auth_header() is None


def test_get_holdings_attaches_insider_summary(temp_db, monkeypatch):
    from backend import holdings, db

    db.insert_trades([
        {"uid": "x:0", "accession": "x", "ticker": "AAPL", "kind": "sell",
         "period": "2026-06-18", "code": "S", "ad": "D", "is_derivative": 0,
         "owner_cik": "8", "shares": 1, "price": 1, "value": 1_000_000,
         "filed_at": "2026-06-18", "source": "live"},
        {"uid": "x:1", "accession": "x", "ticker": "AAPL", "kind": "sell",
         "period": "2026-06-18", "code": "S", "ad": "D", "is_derivative": 0,
         "owner_cik": "9", "shares": 1, "price": 1, "value": 2_000_000,
         "filed_at": "2026-06-18", "source": "live"},
    ])

    monkeypatch.setattr(holdings, "_fetch_portfolio", lambda: [
        {"ticker": "AAPL_US_EQ", "quantity": 3, "averagePrice": 150,
         "currentPrice": 200, "ppl": 150},
        {"ticker": "VWRLl_EQ", "quantity": 10, "averagePrice": 1,
         "currentPrice": 1, "ppl": 0},
    ])

    res = holdings.get_holdings(insider_days=3650)
    assert res["source"] == "live"
    aapl = next(p for p in res["positions"] if p["ticker"] == "AAPL")
    assert aapl["insider"]["sells"] == 2
    assert aapl["insider"]["sell_alert"] is True
    vwrl = next(p for p in res["positions"] if p["raw_ticker"] == "VWRLl_EQ")
    assert vwrl["insider"] is None   # non-US: no insider data


def test_get_holdings_falls_back_to_cache_on_error(temp_db, monkeypatch):
    from backend import holdings, db
    db.save_holdings_cache([{
        "ticker": "AAPL", "raw_ticker": "AAPL_US_EQ", "qty": 1, "avg_price": 1,
        "current_price": 1, "is_us_equity": True}])

    def boom():
        raise RuntimeError("network down")

    db.insert_trades([
        {"uid": "y:0", "accession": "y", "ticker": "AAPL", "kind": "sell",
         "period": "2026-06-18", "code": "S", "ad": "D", "is_derivative": 0,
         "owner_cik": "8", "shares": 1, "price": 1, "value": 1_000_000,
         "filed_at": "2026-06-18", "source": "live"},
    ])

    monkeypatch.setattr(holdings, "_fetch_portfolio", boom)
    res = holdings.get_holdings(insider_days=3650)
    assert res["source"] == "cache"
    assert res["positions"][0]["ticker"] == "AAPL"
    # cross-reference still runs on cache-served positions
    assert res["positions"][0]["insider"] is not None
    assert res["positions"][0]["insider"]["sells"] == 1
