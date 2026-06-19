def test_prices_round_trip(temp_db):
    candles = [
        {"date": "2026-06-10", "open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5, "volume": 100},
        {"date": "2026-06-11", "open": 1.5, "high": 2.5, "low": 1.0, "close": 2.0, "volume": 200},
    ]
    temp_db.save_prices("AAPL", candles)
    got = temp_db.get_prices("AAPL")
    assert len(got) == 2
    assert got[0]["date"] == "2026-06-10"
    assert got[1]["close"] == 2.0


def test_save_prices_is_idempotent(temp_db):
    c = [{"date": "2026-06-10", "open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5, "volume": 100}]
    temp_db.save_prices("AAPL", c)
    temp_db.save_prices("AAPL", c)  # same date again -> replace, not duplicate
    assert len(temp_db.get_prices("AAPL")) == 1
