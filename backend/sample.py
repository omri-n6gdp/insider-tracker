"""A small hand-built sample of insider trades so the dashboard renders
instantly on first launch, before/if live SEC data has loaded. These rows are
tagged source='sample' and are deleted automatically once real data arrives."""
from datetime import datetime, timedelta


def _iso(days_ago, hour=15):
    d = datetime.utcnow() - timedelta(days=days_ago)
    return d.replace(hour=hour, minute=0, second=0, microsecond=0).isoformat()


_RAW = [
    # ticker, issuer, owner, roles, title, code, shares, price, after, days_ago
    ("NVDA", "NVIDIA Corp", "Huang Jen-Hsun", "Director, Officer", "CEO", "S", 120000, 131.40, 75_000_000, 0),
    ("TSLA", "Tesla Inc", "Musk Elon", "Director, Officer, 10% Owner", "CEO", "P", 250000, 248.10, 411_000_000, 0),
    ("AAPL", "Apple Inc", "Cook Timothy D", "Officer", "CEO", "S", 80000, 226.50, 3_280_000, 1),
    ("META", "Meta Platforms Inc", "Zuckerberg Mark", "Director, Officer, 10% Owner", "CEO", "S", 40000, 612.30, 350_000_000, 1),
    ("PLTR", "Palantir Technologies", "Karp Alexander C", "Director, Officer", "CEO", "S", 1_000_000, 41.20, 0, 1),
    ("RKLB", "Rocket Lab USA Inc", "Beck Peter", "Director, Officer", "CEO", "P", 50000, 22.85, 38_400_000, 2),
    ("RKLB", "Rocket Lab USA Inc", "Schevella Adam", "Officer", "CFO", "P", 8000, 22.90, 142_000, 2),
    ("RKLB", "Rocket Lab USA Inc", "Frangos Sandra", "Director", "", "P", 5000, 23.05, 61_000, 3),
    ("AMD", "Advanced Micro Devices", "Su Lisa T", "Director, Officer", "CEO", "A", 60000, 0, 4_900_000, 2),
    ("MSFT", "Microsoft Corp", "Nadella Satya", "Director, Officer", "CEO", "S", 30000, 441.10, 800_000, 3),
    ("COIN", "Coinbase Global Inc", "Armstrong Brian", "Director, Officer, 10% Owner", "CEO", "S", 25000, 252.00, 19_000_000, 3),
    ("ASTS", "AST SpaceMobile Inc", "Avellan Abel", "Director, Officer, 10% Owner", "CEO", "P", 100000, 28.40, 51_000_000, 4),
    ("ASTS", "AST SpaceMobile Inc", "Wisniewski Sean", "Officer", "EVP", "P", 12000, 28.55, 220_000, 4),
    ("AMZN", "Amazon.com Inc", "Jassy Andrew R", "Officer", "CEO", "S", 50000, 201.30, 95_000, 5),
    ("GOOGL", "Alphabet Inc", "Pichai Sundar", "Officer", "CEO", "S", 22000, 178.90, 250_000, 5),
    ("INTC", "Intel Corp", "Gelsinger Patrick", "Director, Officer", "CEO", "P", 30000, 21.10, 1_100_000, 6),
]


def sample_rows():
    rows = []
    for i, (tk, name, owner, roles, title, code, shares, price, after, ago) in enumerate(_RAW):
        from .sec import CODE_MAP  # local import to avoid cycle at import time
        action, kind = CODE_MAP.get(code, (code, "other"))
        rows.append({
            "uid": f"SAMPLE-{i}",
            "accession": f"SAMPLE-{i}",
            "filing_url": "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4",
            "filed_at": _iso(ago),
            "period": _iso(ago)[:10],
            "issuer_name": name,
            "ticker": tk,
            "issuer_cik": "",
            "owner_name": owner,
            "owner_cik": f"SAMPLE-{owner}",
            "roles": roles,
            "officer_title": title,
            "security_title": "Common Stock",
            "code": code,
            "action": action,
            "kind": kind,
            "ad": "A" if kind in ("buy", "grant", "option") else "D",
            "shares": float(shares),
            "price": float(price),
            "value": float(shares) * float(price),
            "shares_after": float(after),
            "is_derivative": 0,
            "source": "sample",
        })
    return rows
