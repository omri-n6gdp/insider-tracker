/* ══════════════════════════════════════════════════════════════
   Insider Ledger — frontend logic
   ══════════════════════════════════════════════════════════════ */
const $ = (id) => document.getElementById(id);

const state = {
  kind: "all",
  role: "",
  minValue: 0,
  sort: "recent",
  q: "",
  lastTotal: -1,
};

/* ── formatting helpers ───────────────────────────────────────── */
function money(n, sign = false) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const a = Math.abs(n);
  const s = sign && n > 0 ? "+" : n < 0 ? "−" : "";
  let body;
  if (a >= 1e9) body = "$" + (a / 1e9).toFixed(a >= 1e10 ? 0 : 1) + "B";
  else if (a >= 1e6) body = "$" + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
  else if (a >= 1e3) body = "$" + Math.round(a / 1e3) + "K";
  else if (a > 0) body = "$" + Math.round(a);
  else return "—";
  return s + body;
}
function shares(n) {
  if (!n) return "—";
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return Math.round(n).toLocaleString("en-US");
  return Math.round(n).toLocaleString("en-US");
}
function price(n) {
  if (!n) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function ago(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso.slice(0, 10);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return mins + "m";
  const h = Math.round(mins / 60);
  if (h < 24) return h + "h";
  const days = Math.round(h / 24);
  return days + "d";
}
function dateShort(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
const esc = (s) => (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function role(r) {
  if (!r) return "Insider";
  return r;
}

/* ── count-up animation for stat values ───────────────────────── */
function countUp(el, target, fmt) {
  const start = el._v || 0;
  el._v = target;
  const t0 = performance.now();
  const dur = 600;
  function step(t) {
    const p = Math.min((t - t0) / dur, 1);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(start + (target - start) * e);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ── render: ledger table ─────────────────────────────────────── */
async function loadTrades() {
  const p = new URLSearchParams({
    kind: state.kind,
    sort: state.sort,
    min_value: state.minValue,
    limit: 250,
  });
  if (state.role) p.set("role", state.role);
  if (state.q) p.set("q", state.q);
  const r = await fetch("/api/trades?" + p);
  const data = await r.json();
  renderRows(data.trades);
}

function renderRows(trades) {
  const tb = $("rows");
  if (!trades.length) {
    tb.innerHTML = `<tr class="empty"><td colspan="8">No filings match these filters yet. New Form 4s arrive all day — try “All”.</td></tr>`;
    return;
  }
  tb.innerHTML = trades
    .map((t, i) => {
      const k = t.kind || "other";
      const rowCls = k === "buy" ? "row-buy" : k === "sell" ? "row-sell" : "";
      const valCls = k === "buy" ? "val-buy" : k === "sell" ? "val-sell" : t.value ? "" : "val-zero";
      const titleAttr = t.shares ? `title="${Math.round(t.shares).toLocaleString("en-US")} shares"` : "";
      const link = t.filing_url
        ? `<a href="${esc(t.filing_url)}" target="_blank" rel="noopener" title="Open SEC filing">↗</a>`
        : "";
      return `<tr class="${rowCls} reveal" style="animation-delay:${Math.min(i * 14, 420)}ms">
        <td class="c-when">${ago(t.filed_at)}<span class="date">${dateShort(t.filed_at)}</span></td>
        <td><span class="ticker">${esc(t.ticker) || "—"}</span><span class="co-name">${esc(t.issuer_name)}</span></td>
        <td><span class="who-name">${esc(t.owner_name)}</span><span class="who-role">${esc(t.officer_title || role(t.roles))}</span></td>
        <td><span class="pill k-${k}">${esc(t.action)}</span></td>
        <td class="num" ${titleAttr}>${shares(t.shares)}</td>
        <td class="num">${price(t.price)}</td>
        <td class="num ${valCls}">${t.value ? money(t.value) : "—"}</td>
        <td class="c-link">${link}</td>
      </tr>`;
    })
    .join("");
}

/* ── render: stats strip ──────────────────────────────────────── */
async function loadStats() {
  const r = await fetch("/api/stats?days=7");
  const s = await r.json();
  $("statWindow").textContent = "· " + s.days + "d";
  countUp($("buysValue"), s.buys_value, (v) => money(v));
  countUp($("sellsValue"), s.sells_value, (v) => money(v));
  $("buysCount").textContent = s.buys_count.toLocaleString("en-US");
  $("sellsCount").textContent = s.sells_count.toLocaleString("en-US");

  const net = $("netValue");
  net.className = "stat-value " + (s.net_value >= 0 ? "net-pos" : "net-neg");
  countUp(net, s.net_value, (v) => money(v, true));
  $("netMeta").textContent = s.net_value >= 0 ? "insiders net buying ↑" : "insiders net selling ↓";

  renderActive(s.active);
  renderTopSells(s.top_sells);
}

function renderActive(active) {
  const el = $("activeList");
  if (!active || !active.length) {
    el.innerHTML = `<li class="muted small">—</li>`;
    return;
  }
  el.innerHTML = active
    .map((a) => {
      const tot = (a.buy_v || 0) + (a.sell_v || 0) || 1;
      const bp = ((a.buy_v || 0) / tot) * 100;
      return `<li>
        <div style="flex:1">
          <span class="ticker">${esc(a.ticker)}</span>
          <div class="bar"><i class="b" style="width:${bp}%"></i><i class="s" style="width:${100 - bp}%"></i></div>
        </div>
        <span class="ratio">${a.n}</span>
      </li>`;
    })
    .join("");
}

function renderTopSells(rows) {
  const el = $("topSells");
  if (!rows || !rows.length) {
    el.innerHTML = `<li class="muted small">None this week.</li>`;
    return;
  }
  el.innerHTML = rows
    .map(
      (t) => `<li>
        <div class="lead-co">
          <span class="ticker">${esc(t.ticker)}</span>
          <span class="who">${esc(t.owner_name)}</span>
        </div>
        <span class="ld-val">${money(t.value)}</span>
      </li>`
    )
    .join("");
}

/* ── render: cluster buys ─────────────────────────────────────── */
async function loadClusters() {
  const r = await fetch("/api/clusters?days=14&min_owners=2");
  const data = await r.json();
  const el = $("clusterList");
  $("clusterCount").textContent = data.clusters.length;
  if (!data.clusters.length) {
    el.innerHTML = `<p class="muted small">No clustered buying in the last 14 days. That's normal — clusters are rare and worth watching for.</p>`;
    return;
  }
  el.innerHTML = data.clusters
    .map((c) => {
      const names = (c.names || "").split(",").slice(0, 3).join(", ");
      return `<div class="cluster-item" data-ticker="${esc(c.ticker)}">
        <div class="cluster-head">
          <span class="ticker">${esc(c.ticker)}</span>
          <span class="ci-val">${money(c.total_value)}</span>
        </div>
        <div class="cluster-sub"><span class="cluster-badge">${c.owners} insiders</span>${esc(names)}</div>
      </div>`;
    })
    .join("");
  el.querySelectorAll(".cluster-item").forEach((it) =>
    it.addEventListener("click", () => {
      $("search").value = it.dataset.ticker;
      state.q = it.dataset.ticker;
      setKind("buy");
      loadTrades();
      window.scrollTo({ top: 0, behavior: "smooth" });
    })
  );
}

/* ── render: ticker tape ──────────────────────────────────────── */
async function loadTape() {
  const r = await fetch("/api/trades?kind=all&sort=recent&limit=26");
  const data = await r.json();
  const items = data.trades.filter((t) => t.kind === "buy" || t.kind === "sell");
  const list = items.length ? items : data.trades;
  if (!list.length) return;
  const html = list
    .map((t) => {
      const dir = t.kind === "buy" ? "up" : t.kind === "sell" ? "down" : "";
      const arrow = t.kind === "buy" ? "▲" : t.kind === "sell" ? "▼" : "•";
      const v = t.value ? money(t.value) : t.action;
      return `<span class="tape-item"><span class="${dir}">${arrow}</span> <b>${esc(t.ticker) || "—"}</b> ${esc(t.action)} ${v}</span>`;
    })
    .join("");
  $("tapeTrack").innerHTML = html + html; // duplicate for seamless loop
}

/* ── status / live dot ────────────────────────────────────────── */
async function loadStatus() {
  try {
    const r = await fetch("/api/status");
    const s = await r.json();
    const dot = $("liveDot");
    if (s.source === "live") {
      dot.className = "live-dot live";
      $("statusText").textContent = "live · " + s.live_count.toLocaleString("en-US") + " filings";
    } else if (s.refreshing || s.source === "starting") {
      dot.className = "live-dot";
      $("statusText").textContent = "fetching from SEC…";
    } else if (s.source === "sample") {
      dot.className = "live-dot";
      $("statusText").textContent = "demo data";
    } else {
      dot.className = "live-dot stale";
      $("statusText").textContent = s.source;
    }
    const when = s.last_success ? "updated " + ago(s.last_success) + " ago" : "starting up";
    $("statusSub").textContent = s.refreshing ? "refreshing…" : when;

    // when the backend has pulled new filings, refresh the view
    if (s.total_count !== state.lastTotal) {
      state.lastTotal = s.total_count;
      loadAll();
    }
  } catch (e) {
    $("statusText").textContent = "offline";
    $("liveDot").className = "live-dot stale";
  }
}

/* ── filters / controls ───────────────────────────────────────── */
function setKind(kind) {
  state.kind = kind;
  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.kind === kind));
}

function wire() {
  document.querySelectorAll(".chip").forEach((c) =>
    c.addEventListener("click", () => {
      setKind(c.dataset.kind);
      loadTrades();
    })
  );
  $("roleSel").addEventListener("change", (e) => { state.role = e.target.value; loadTrades(); });
  $("minVal").addEventListener("change", (e) => { state.minValue = +e.target.value; loadTrades(); });
  $("sortSel").addEventListener("change", (e) => { state.sort = e.target.value; loadTrades(); });

  let deb;
  $("search").addEventListener("input", (e) => {
    clearTimeout(deb);
    deb = setTimeout(() => { state.q = e.target.value.trim(); loadTrades(); }, 280);
  });

  $("refreshBtn").addEventListener("click", async () => {
    const b = $("refreshBtn");
    b.classList.add("spin");
    await fetch("/api/refresh?pages=1", { method: "POST" });
    setTimeout(() => { loadAll(); loadStatus(); b.classList.remove("spin"); }, 2500);
  });
}

/* ── orchestration ────────────────────────────────────────────── */
function loadAll() {
  loadTrades();
  loadStats();
  loadClusters();
  loadTape();
}

wire();
loadAll();
loadStatus();
setInterval(loadStatus, 15000); // poll backend; auto-reloads view when new data lands
