def test_temp_db_starts_empty(temp_db):
    assert temp_db.count() == 0
