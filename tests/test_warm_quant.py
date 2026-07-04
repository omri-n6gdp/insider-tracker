def test_warm_quant_data_bounded(monkeypatch):
    """The warmer pre-caches fundamentals for the top-N active tickers only,
    so a single run makes a bounded number of market calls."""
    from backend import main
    monkeypatch.setattr(main.db, "tickers", lambda: ["AAA", "BBB", "CCC", "DDD"])
    calls = []
    monkeypatch.setattr(main.market, "get_fundamentals",
                        lambda t: (calls.append(t), {"available": True})[1])
    n = main._warm_quant_data(limit=2)
    assert calls == ["AAA", "BBB"]
    assert n == 2
    assert main.STATUS.get("quant_warmed") == 2


def test_warm_quant_data_survives_fetch_errors(monkeypatch):
    from backend import main
    monkeypatch.setattr(main.db, "tickers", lambda: ["AAA", "BBB"])

    def boom(t):
        raise RuntimeError("network down")

    monkeypatch.setattr(main.market, "get_fundamentals", boom)
    # Should not raise; simply warms nothing.
    assert main._warm_quant_data(limit=5) == 0
