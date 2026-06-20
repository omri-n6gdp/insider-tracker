def _t(uid, owner, ticker, kind="buy", value=1000.0):
    return {
        "uid": uid, "accession": uid.split(":")[0], "ticker": ticker, "kind": kind,
        "period": "2026-06-10", "code": "P", "ad": "A", "is_derivative": 0,
        "owner_cik": owner, "owner_name": "Jane Insider", "roles": "Director",
        "shares": 100, "price": value / 100, "value": value, "shares_after": 100,
        "filed_at": "2026-06-10", "source": "live",
    }


def test_trades_for_owner_filters_and_compiles(temp_db):
    temp_db.insert_trades([
        _t("a:0", "111", "AAPL", value=1000.0),
        _t("a:1", "111", "AAPL", value=2000.0),   # same group -> compiles with a:0
        _t("b:0", "222", "MSFT", value=5000.0),    # different owner
    ])
    rows = temp_db.trades_for_owner("111")
    assert len(rows) == 1                  # two AAPL lines compiled into one
    assert rows[0]["ticker"] == "AAPL"
    assert rows[0]["value"] == 3000.0
    assert rows[0]["owner_cik"] == "111"


def test_trades_for_owner_empty_for_unknown(temp_db):
    assert temp_db.trades_for_owner("999") == []
