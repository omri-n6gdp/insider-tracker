def _row(uid, ticker, issuer, owner):
    return {"uid": uid, "accession": uid.split(":")[0], "ticker": ticker,
            "issuer_name": issuer, "kind": "buy", "period": "2026-06-18",
            "code": "P", "ad": "A", "is_derivative": 0, "owner_cik": owner,
            "owner_name": "Owner " + owner, "shares": 1, "price": 100,
            "value": 100, "filed_at": "2026-06-18", "source": "live"}


def test_norm_ticker_maps_sentinels_to_empty():
    from backend import sec
    assert sec._norm_ticker("NONE") == ""
    assert sec._norm_ticker(" n/a ") == ""
    assert sec._norm_ticker("none") == ""
    assert sec._norm_ticker(None) == ""
    assert sec._norm_ticker("aapl") == "AAPL"


def test_normalize_tickers_unmerges_bogus_clusters(temp_db):
    # Two DIFFERENT issuers whose filings carry no real ticker ("NONE") must not
    # be merged into one bogus cluster keyed on "NONE".
    temp_db.insert_trades([
        _row("a:0", "NONE", "Alpha Capital", "1"),
        _row("b:0", "NONE", "Beta Holdings", "2"),
        _row("c:0", "AAPL", "Apple Inc", "3"),
        _row("d:0", "AAPL", "Apple Inc", "4"),
    ])
    temp_db.normalize_tickers()
    assert set(temp_db.tickers()) == {"AAPL"}
    cluster_tickers = {c["ticker"] for c in temp_db.clusters(days=3650, min_owners=2)}
    assert "NONE" not in cluster_tickers
    assert "AAPL" in cluster_tickers   # a real 2-owner cluster still surfaces
