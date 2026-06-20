def _trade(uid, ticker, kind, value, owner="111", name="Jane Insider"):
    return {
        "uid": uid, "accession": uid.split(":")[0], "ticker": ticker, "kind": kind,
        "period": "2026-06-10", "code": "P" if kind == "buy" else "S", "ad": "A",
        "is_derivative": 0, "owner_cik": owner, "owner_name": name,
        "roles": "Director", "shares": 100, "price": value / 100, "value": value,
        "shares_after": 100, "filed_at": "2026-06-10", "source": "live",
    }


def test_stock_detail_assembles_payload(temp_db, monkeypatch):
    from backend import detail, market

    temp_db.insert_trades([
        _trade("a:0", "AAPL", "buy", 50_000),
        _trade("b:0", "AAPL", "sell", 10_000, owner="222", name="Bob Boss"),
    ])
    monkeypatch.setattr(market, "get_prices", lambda t, period="1y": {
        "ticker": t, "available": True,
        "candles": [{"date": "2026-06-10", "open": 1, "high": 2, "low": 1,
                     "close": 1.5, "volume": 10}]})
    monkeypatch.setattr(market, "get_fundamentals", lambda t: {
        "ticker": t, "available": True, "sector": "Technology", "pe": 30.0})

    d = detail.stock_detail("aapl", history_days=3650)
    assert d["ticker"] == "AAPL"
    assert d["fundamentals"]["sector"] == "Technology"
    assert len(d["prices"]["candles"]) == 1
    assert len(d["trades"]) == 2                       # buy + sell (distinct groups)
    assert len(d["markers"]) == 2                      # both have price>0 + a date
    assert {m["kind"] for m in d["markers"]} == {"buy", "sell"}
    sell_marker = next(m for m in d["markers"] if m["kind"] == "sell")
    assert sell_marker["value"] == 10_000              # marker carries trade value
    assert d["summary"]["buys"] == 1 and d["summary"]["sells"] == 1


def test_stock_detail_markers_skip_unpriced(temp_db, monkeypatch):
    from backend import detail, market
    temp_db.insert_trades([_trade("a:0", "AAPL", "grant", 0)])  # kind grant, price 0
    monkeypatch.setattr(market, "get_prices", lambda t, period="1y": {
        "ticker": t, "available": False, "candles": []})
    monkeypatch.setattr(market, "get_fundamentals", lambda t: {
        "ticker": t, "available": False})
    d = detail.stock_detail("AAPL")
    assert d["markers"] == []                          # grant is not a buy/sell marker


def test_insider_detail_groups_history(temp_db):
    from backend import detail
    temp_db.insert_trades([
        _trade("a:0", "AAPL", "buy", 50_000),
        _trade("c:0", "MSFT", "buy", 20_000),
    ])
    d = detail.insider_detail("111")
    assert d["owner_cik"] == "111"
    assert d["owner_name"] == "Jane Insider"
    assert d["roles"] == "Director"
    assert len(d["trades"]) == 2
    assert d["summary"]["buys"] == 2
    assert d["summary"]["net_value"] == 70_000          # 50k + 20k buys, no sells
    assert sorted(d["tickers"]) == ["AAPL", "MSFT"]


def test_insider_detail_empty(temp_db):
    from backend import detail
    d = detail.insider_detail("999")
    assert d["trades"] == []
    assert d["owner_name"] is None
