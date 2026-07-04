def test_digest_has_sections(temp_db, monkeypatch):
    import datetime as dt
    from backend import digest, holdings
    # Use a recent date so the trades fall inside the digest's 14-day window
    # regardless of when this test runs (the window is relative to date('now')).
    recent = dt.date.today().isoformat()
    temp_db.insert_trades([
        {"uid": "a:0", "accession": "a", "ticker": "AAA", "kind": "buy",
         "period": recent, "code": "P", "ad": "A", "is_derivative": 0,
         "owner_cik": "1", "owner_name": "X", "shares": 1, "price": 1, "value": 1,
         "filed_at": recent, "source": "live"},
        {"uid": "b:0", "accession": "b", "ticker": "AAA", "kind": "buy",
         "period": recent, "code": "P", "ad": "A", "is_derivative": 0,
         "owner_cik": "2", "owner_name": "Y", "shares": 1, "price": 1, "value": 1,
         "filed_at": recent, "source": "live"},
    ])
    temp_db.add_watch("ticker", "AAA")
    monkeypatch.setattr(holdings, "get_holdings",
                        lambda insider_days=30: {"source": "cache", "positions": []})
    d = digest.build(temp_db, holdings)
    assert "clusters" in d and "holdings_alerts" in d and "watchlist_activity" in d
    assert any(w["ticker"] == "AAA" for w in d["watchlist_activity"])
