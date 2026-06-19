def _trade(uid, kind, value, owner):
    return {
        "uid": uid, "accession": uid.split(":")[0], "ticker": "AAPL", "kind": kind,
        "period": "2026-06-18", "code": "P" if kind == "buy" else "S", "ad": "A",
        "is_derivative": 0, "owner_cik": owner, "shares": 1, "price": value,
        "value": value, "filed_at": "2026-06-18", "source": "live",
    }


def test_insider_summary_flags_net_selling(temp_db):
    temp_db.insert_trades([
        _trade("a:0", "sell", 2_000_000, "8"),
        _trade("b:0", "sell", 1_000_000, "9"),
    ])
    s = temp_db.insider_summary("AAPL", days=3650)
    assert s["sells"] == 2
    assert s["buys"] == 0
    assert s["sell_value"] == 3_000_000
    assert s["sell_alert"] is True


def test_insider_summary_no_alert_when_buying(temp_db):
    temp_db.insert_trades([
        _trade("a:0", "buy", 2_000_000, "8"),
        _trade("b:0", "sell", 500_000, "9"),
    ])
    s = temp_db.insider_summary("AAPL", days=3650)
    assert s["sell_alert"] is False


def test_holdings_cache_round_trip(temp_db):
    positions = [
        {"ticker": "AAPL", "raw_ticker": "AAPL_US_EQ", "qty": 3, "avg_price": 150,
         "current_price": 200, "is_us_equity": True},
        {"ticker": "VWRLl_EQ", "raw_ticker": "VWRLl_EQ", "qty": 10, "avg_price": 1,
         "current_price": 1, "is_us_equity": False},
    ]
    temp_db.save_holdings_cache(positions)
    got = temp_db.get_holdings_cache()
    assert len(got) == 2
    aapl = next(p for p in got if p["ticker"] == "AAPL")
    assert aapl["is_us_equity"] is True
