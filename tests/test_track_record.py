from backend import track_record as tr


def _candles(prices, start="2026-01-01"):
    # prices: list of closes on consecutive days from start
    import datetime as dt
    d = dt.date.fromisoformat(start)
    out = []
    for p in prices:
        out.append({"date": d.isoformat(), "open": p, "high": p, "low": p,
                    "close": p, "volume": 1})
        d += dt.timedelta(days=1)
    return out


def test_forward_return_uses_close_on_or_after():
    candles = _candles([100, 101, 110])  # day0=100 ... day2=110
    # horizon 2 trading days from day0 -> 110/100 - 1 = 0.10
    assert round(tr.forward_return(candles, "2026-01-01", 2), 4) == 0.10
    # not enough future data -> None
    assert tr.forward_return(candles, "2026-01-01", 5) is None


def test_market_adjusted_subtracts_benchmark():
    stock = _candles([100, 100, 120])   # +20%
    spy = _candles([100, 100, 110])     # +10%
    assert round(tr.market_adjusted(stock, spy, "2026-01-01", 2), 4) == 0.10


def test_rating_shrinks_small_samples_toward_neutral():
    # one great trade should NOT yield a near-perfect rating
    high_n = tr.rating(avg_ret_3m=0.20, win_rate=0.8, n=20)
    low_n = tr.rating(avg_ret_3m=0.20, win_rate=0.8, n=1)
    assert 0 <= low_n <= 100 and 0 <= high_n <= 100
    assert high_n > low_n           # more samples -> stronger signal
    assert low_n < 75              # a single sample is heavily shrunk
    # a neutral/empty record sits near the middle
    assert 40 <= tr.rating(avg_ret_3m=0.0, win_rate=0.5, n=10) <= 60
