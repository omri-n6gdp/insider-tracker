import os
from backend.main import resolve_static_path


def test_serves_real_file_when_present(tmp_path):
    dist = tmp_path
    (dist / "index.html").write_text("<div id='root'></div>")
    assets = dist / "assets"
    assets.mkdir()
    (assets / "app.js").write_text("console.log(1)")
    got = resolve_static_path(str(dist), "assets/app.js")
    assert got == str(assets / "app.js")


def test_falls_back_to_index_for_client_routes(tmp_path):
    dist = tmp_path
    (dist / "index.html").write_text("<div id='root'></div>")
    # a client route like /stock/AAPL has no real file -> index.html
    assert resolve_static_path(str(dist), "stock/AAPL") == str(dist / "index.html")
    assert resolve_static_path(str(dist), "") == str(dist / "index.html")


def test_path_traversal_is_blocked(tmp_path):
    dist = tmp_path
    (dist / "index.html").write_text("x")
    # escaping the dist dir must fall back to index.html, never serve outside
    got = resolve_static_path(str(dist), "../../etc/passwd")
    assert got == str(dist / "index.html")
