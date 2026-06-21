from backend import score


def test_subscores_are_bounded_0_100():
    assert 0 <= score.cluster_score(1) <= 100
    assert score.cluster_score(4) > score.cluster_score(1)
    assert score.seniority_score(["CEO"]) > score.seniority_score(["Director"])
    assert score.size_score(1_000_000, 1_000_000_000) > score.size_score(1000, 1_000_000_000)
    assert score.valuation_score(12) > score.valuation_score(80)   # cheaper = higher
    assert score.valuation_score(None) == 50.0                      # unknown = neutral


def test_total_is_weighted_blend_and_bounded():
    subs = {"cluster": 80, "seniority": 100, "size": 60, "track": 70, "valuation": 50}
    t = score.total(subs)
    assert 0 <= t <= 100
    # heavier cluster/seniority should pull a high-cluster name up
    assert score.total({**subs, "cluster": 100, "seniority": 100}) > t


def test_top_buys_ranks_and_explains(temp_db, monkeypatch):
    from backend import market
    temp_db.insert_trades([
        {"uid": "a:0", "accession": "a", "ticker": "AAA", "kind": "buy",
         "period": "2026-06-15", "code": "P", "ad": "A", "is_derivative": 0,
         "owner_cik": "1", "owner_name": "CEO One", "roles": "Officer",
         "officer_title": "CEO", "shares": 1000, "price": 10, "value": 10000,
         "filed_at": "2026-06-15", "source": "live"},
        {"uid": "b:0", "accession": "b", "ticker": "AAA", "kind": "buy",
         "period": "2026-06-15", "code": "P", "ad": "A", "is_derivative": 0,
         "owner_cik": "2", "owner_name": "Dir Two", "roles": "Director",
         "shares": 500, "price": 10, "value": 5000,
         "filed_at": "2026-06-15", "source": "live"},
    ])
    monkeypatch.setattr(market, "get_fundamentals",
                        lambda t: {"ticker": t, "available": True,
                                   "market_cap": 1_000_000, "pe": 15})
    recs = score.top_buys(temp_db, market, days=30, limit=10)
    assert recs and recs[0]["ticker"] == "AAA"
    r = recs[0]
    assert r["owners"] == 2
    assert set(r["subscores"]) == {"cluster", "seniority", "size", "track", "valuation"}
    assert 0 <= r["score"] <= 100
    assert r["buy_value"] == 15000
