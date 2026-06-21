def _buy(uid, ticker, value):
    return {"uid": uid, "accession": uid.split(":")[0], "ticker": ticker,
            "kind": "buy", "period": "2026-06-18", "code": "P", "ad": "A",
            "is_derivative": 0, "owner_cik": uid, "shares": 1, "price": value,
            "value": value, "filed_at": "2026-06-18", "source": "live"}


def test_sector_flow_groups_by_cached_sector(temp_db):
    temp_db.insert_trades([_buy("1:0", "AAA", 1000), _buy("2:0", "BBB", 500)])
    temp_db.save_fundamentals("AAA", {"ticker": "AAA", "sector": "Tech"})
    temp_db.save_fundamentals("BBB", {"ticker": "BBB", "sector": "Tech"})
    rows = temp_db.sector_flow(days=3650)
    tech = next(r for r in rows if r["sector"] == "Tech")
    assert tech["buy_value"] == 1500
    # a ticker with no cached fundamentals is excluded
    temp_db.insert_trades([_buy("3:0", "CCC", 9999)])
    assert all(r["sector"] for r in temp_db.sector_flow(days=3650))
