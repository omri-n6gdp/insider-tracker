"""Daily digest: the few things worth knowing today, composed from existing
data — fresh cluster buys, insider selling in your holdings, and activity in
anything you're watching."""


def build(db, holdings_mod, cluster_days=14, watch_days=14):
    clusters = db.clusters(days=cluster_days, min_owners=2)
    held = holdings_mod.get_holdings(insider_days=30)
    alerts = [p for p in held.get("positions", [])
              if p.get("is_us_equity") and (p.get("insider") or {}).get("sell_alert")]
    return {
        "clusters": clusters[:8],
        "holdings_alerts": alerts,
        "watchlist_activity": db.watchlist_activity(days=watch_days),
    }
