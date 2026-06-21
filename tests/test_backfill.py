from backend import backfill

SAMPLE = """Description ...
Form Type   Company Name        CIK   Date Filed  File Name
---------------------------------------------------------------
4           Acme Inc            12345 2026-06-10  edgar/data/12345/0001.txt
4/A         Beta Co             222   2026-06-10  edgar/data/222/0002.txt
8-K         Gamma               333   2026-06-10  edgar/data/333/0003.txt
"""


def test_parse_form_index_keeps_only_form4():
    rows = backfill.parse_form_index(SAMPLE)
    assert len(rows) == 1                       # only the exact "4", not "4/A" or "8-K"
    assert rows[0]["cik"] == "12345"
    assert rows[0]["path"] == "edgar/data/12345/0001.txt"
