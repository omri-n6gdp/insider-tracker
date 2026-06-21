def test_strategy_crud(temp_db):
    sid = temp_db.create_strategy("Cluster 2+", {"min_cluster_owners": 2, "hold_days": 63})
    assert isinstance(sid, int)
    s = temp_db.get_strategy(sid)
    assert s["name"] == "Cluster 2+"
    assert s["rule"]["min_cluster_owners"] == 2     # rule_json round-trips to a dict
    assert s["active"] == 1
    assert any(x["id"] == sid for x in temp_db.list_strategies())
    temp_db.set_strategy_active(sid, False)
    assert temp_db.get_strategy(sid)["active"] == 0
    temp_db.delete_strategy(sid)
    assert temp_db.get_strategy(sid) is None


def test_strategy_positions(temp_db):
    sid = temp_db.create_strategy("X", {"hold_days": 10})
    temp_db.add_position(sid, {"ticker": "AAA", "opened_at": "2026-06-10",
                               "entry_price": 10.0, "shares": 100, "status": "open"})
    pos = temp_db.positions_for_strategy(sid)
    assert len(pos) == 1 and pos[0]["status"] == "open"
    temp_db.close_position(pos[0]["id"], exit_at="2026-06-20", exit_price=12.0, pnl=200.0)
    pos = temp_db.positions_for_strategy(sid)
    assert pos[0]["status"] == "closed" and pos[0]["pnl"] == 200.0
