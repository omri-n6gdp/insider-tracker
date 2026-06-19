from backend.aggregate import compile_trades


def _line(**kw):
    base = {
        "owner_cik": "1", "ticker": "AAPL", "kind": "buy", "period": "2026-06-10",
        "code": "P", "ad": "A", "is_derivative": 0, "shares": 100, "price": 10.0,
        "value": 1000.0, "shares_after": 100, "uid": "acc:0", "accession": "acc",
        "filed_at": "2026-06-10",
    }
    base.update(kw)
    return base


def test_compile_sums_shares_and_weights_price():
    rows = [
        _line(shares=100, price=10.0, value=1000.0, shares_after=100, uid="acc:0"),
        _line(shares=200, price=11.0, value=2200.0, shares_after=300, uid="acc:1"),
    ]
    out = compile_trades(rows)
    assert len(out) == 1
    t = out[0]
    assert t["shares"] == 300
    assert t["value"] == 3200.0
    assert round(t["price"], 4) == round(3200 / 300, 4)
    assert t["line_count"] == 2
    assert t["shares_after"] == 300  # taken from the latest line


def test_compile_keeps_distinct_insiders_separate():
    rows = [
        _line(owner_cik="1", uid="a:0", accession="a"),
        _line(owner_cik="2", uid="b:0", accession="b"),
    ]
    out = compile_trades(rows)
    assert len(out) == 2


def test_compile_collects_distinct_accessions():
    rows = [
        _line(uid="a:0", accession="a"),
        _line(uid="a:1", accession="a"),  # same accession -> deduped in list
    ]
    out = compile_trades(rows)
    assert out[0]["accessions"] == ["a"]
    assert out[0]["line_count"] == 2


def test_compile_weights_price_even_when_value_field_is_zero():
    # Defends against a data source that stores price but leaves value at 0.
    rows = [
        _line(shares=100, price=10.0, value=0.0, uid="a:0"),
        _line(shares=50, price=12.0, value=0.0, uid="a:1"),
    ]
    out = compile_trades(rows)
    assert round(out[0]["price"], 4) == round((100 * 10 + 50 * 12) / 150, 4)


def test_compile_ignores_zero_price_lines_in_weighting():
    rows = [
        _line(shares=100, price=10.0, value=1000.0, uid="a:0"),
        _line(shares=50, price=0.0, value=0.0, uid="a:1"),  # grant-like, unpriced
    ]
    out = compile_trades(rows)
    t = out[0]
    assert t["shares"] == 150          # all shares counted
    assert t["price"] == 10.0          # price weighted only over the priced line
