def test_insider_track_round_trip_and_leaderboard(temp_db):
    temp_db.save_insider_track({
        "owner_cik": "1", "owner_name": "Jane", "n_buys": 8, "avg_ret_1m": 0.05,
        "avg_ret_3m": 0.12, "avg_ret_6m": 0.2, "win_rate": 0.75, "rating": 80,
        "sample_ok": 1})
    temp_db.save_insider_track({
        "owner_cik": "2", "owner_name": "Bob", "n_buys": 1, "avg_ret_1m": 0.0,
        "avg_ret_3m": -0.1, "avg_ret_6m": 0.0, "win_rate": 0.0, "rating": 35,
        "sample_ok": 0})
    one = temp_db.get_insider_track("1")
    assert one["rating"] == 80 and one["owner_name"] == "Jane"
    # leaderboard: sample_ok only, by rating desc
    board = temp_db.top_insider_tracks(limit=10, min_buys=3)
    assert [b["owner_cik"] for b in board] == ["1"]


def test_distinct_buy_owners_and_buys_for_owner(temp_db):
    temp_db.insert_trades([
        {"uid": "a:0", "accession": "a", "ticker": "AAPL", "kind": "buy",
         "period": "2026-01-10", "code": "P", "ad": "A", "is_derivative": 0,
         "owner_cik": "1", "owner_name": "Jane", "shares": 10, "price": 5,
         "value": 50, "filed_at": "2026-01-10", "source": "live"},
        {"uid": "b:0", "accession": "b", "ticker": "AAPL", "kind": "sell",
         "period": "2026-01-11", "code": "S", "ad": "D", "is_derivative": 0,
         "owner_cik": "1", "owner_name": "Jane", "shares": 1, "price": 5,
         "value": 5, "filed_at": "2026-01-11", "source": "live"},
    ])
    assert temp_db.distinct_buy_owners() == ["1"]
    buys = temp_db.buys_for_owner("1")
    assert len(buys) == 1 and buys[0]["ticker"] == "AAPL"  # only the buy
