def _line(uid, **kw):
    base = {
        "uid": uid, "accession": uid.split(":")[0], "ticker": "AAPL", "kind": "buy",
        "period": "2026-06-10", "code": "P", "ad": "A", "is_derivative": 0,
        "owner_cik": "1", "shares": 100, "price": 10.0, "value": 1000.0,
        "shares_after": 100, "filed_at": "2026-06-10", "source": "live",
    }
    base.update(kw)
    return base


def test_query_trades_compiled_collapses_lines(temp_db):
    temp_db.insert_trades([
        _line("acc:0", shares=100, price=10.0, value=1000.0),
        _line("acc:1", shares=200, price=11.0, value=2200.0),
    ])
    raw = temp_db.query_trades(compiled=False)
    assert len(raw) == 2
    compiled = temp_db.query_trades(compiled=True)
    assert len(compiled) == 1
    assert compiled[0]["shares"] == 300
    assert compiled[0]["value"] == 3200.0
    assert compiled[0]["line_count"] == 2


def test_query_trades_compiled_min_value_filters_on_total(temp_db):
    temp_db.insert_trades([
        _line("acc:0", shares=100, price=10.0, value=1000.0),
        _line("acc:1", shares=200, price=11.0, value=2200.0),
    ])
    # Each line is < 3000, but the compiled total (3200) clears the filter.
    assert len(temp_db.query_trades(compiled=True, min_value=3000)) == 1
