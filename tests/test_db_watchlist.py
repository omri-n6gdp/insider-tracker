def test_watchlist_crud(temp_db):
    temp_db.add_watch("ticker", "AAPL")
    temp_db.add_watch("ticker", "AAPL")            # idempotent
    temp_db.add_watch("insider", "12345")
    items = temp_db.list_watch()
    keys = {(w["kind"], w["key"]) for w in items}
    assert ("ticker", "AAPL") in keys and ("insider", "12345") in keys
    assert len(items) == 2                          # no duplicate AAPL
    assert temp_db.is_watched("ticker", "AAPL") is True
    temp_db.remove_watch("ticker", "AAPL")
    assert temp_db.is_watched("ticker", "AAPL") is False
