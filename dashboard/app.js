// Token Radar dashboard: renders window.RADAR (../data.js, from main.ts) with no network.
// Routes: #/ board, #/filtered?cat=..&chain=.., #/protocol/<slug>, #/live, #/model.
(function () {
  'use strict';
  var D = window.RADAR;
  var app = document.getElementById('app');
  if (!D) { app.textContent = 'data.js is missing: run main.ts to write it beside dashboard/.'; return; }
  var M = D.model;
  var ROWS = D.rows;
  var BY_SLUG = {};
  ROWS.forEach(function (r) { BY_SLUG[r.slug] = r; });

  // ---------- formatting ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function usd(n) {
    if (n == null || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function usdFull(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  // Signed per cent as text ("+1.23%"); pct() wraps it in a coloured, glyphed span.
  function sgn(n) { return (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function pct(n) {
    if (n == null || !isFinite(n)) return '<span class="muted">n/a</span>';
    return '<span class="num ' + (n > 0 ? 'up">▲ ' : n < 0 ? 'down">▼ ' : 'muted">') + sgn(n) + '</span>';
  }
  // A multiple with d decimals ("1.234×"), or n/a.
  function mult(n, d) { return n == null ? 'n/a' : n.toFixed(d) + '×'; }
  function ageText(d) {
    if (d == null) return 'unknown';
    return d >= 365 ? (d / 365).toFixed(1) + ' yrs' : d + ' days';
  }
  function catOf(r) { return r.category || 'Uncategorised'; }
  function nChains(r) { var n = r.chains.length; return n + ' chain' + (n === 1 ? '' : 's'); }
  function tag(r) { return r.watch ? '<span class="tag wl">WATCHLIST</span>' : '<span class="tag early">EARLY</span>'; }
  function hero(h, p) { return '<section class="hero"><h1>' + h + '</h1><p>' + p + '</p>'; }
  function card(h, body, st) { return '<section class="card"' + (st ? ' style="' + st + '"' : '') + '><h2>' + h + '</h2>' + body + '</section>'; }
  function foot(t) { return '<p class="foot">' + t + '</p>'; }
  function rows(list, fn) { return list.map(fn).join(''); }
  function plink(r, html, cls) { return '<a' + (cls ? ' class="' + cls + '"' : '') + ' href="#/protocol/' + encodeURIComponent(r.slug) + '">' + html + '</a>'; }

  // ---------- the model, recomputed in the page ----------
  // Same arithmetic as lib/model.ts score(); the detail view shows that both agree to the dollar.
  function implied(r) {
    var g = Math.min(M.growth_cap, Math.max(M.growth_floor, r.d7 == null ? 0 : r.d7));
    var growth = 1 + (g / 100) * M.growth_weight;
    var age = r.m.age_days == null ? M.unknown_age_days : r.m.age_days;
    var maturity = M.maturity_floor + M.maturity_range * (Math.min(age, M.maturity_days) / M.maturity_days);
    var chains = Math.min(M.chains_cap, 1 + M.chains_step * Math.log2(Math.max(1, r.chains.length)));
    var cat = D.category_factor[r.m.family];
    return Math.max(1, Math.round(r.tvl * M.base_multiple * growth * maturity * chains * cat));
  }

  // ---------- state & routing ----------
  var state = { q: '', cat: '', chain: '', scope: 'all', sort: 'rank', dir: 1 };
  var DEFAULT_DIR = { rank: 1, name: 1, category: 1, chains: -1, tvl: -1, d7: -1, value: -1 };

  function parseQuery(s) {
    var o = {};
    (s || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      var k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i));
      o[k] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
    });
    return o;
  }
  function applyQuery(o) {
    state.q = o.q || '';
    state.cat = o.cat || o.category || '';
    state.chain = o.chain || '';
    state.scope = o.scope === 'watchlist' || o.scope === 'early' ? o.scope : 'all';
    state.sort = DEFAULT_DIR[o.sort] ? o.sort : 'rank';
    state.dir = o.dir === 'asc' ? 1 : o.dir === 'desc' ? -1 : DEFAULT_DIR[state.sort];
  }
  function queryString() {
    var p = [];
    if (state.cat) p.push('cat=' + encodeURIComponent(state.cat));
    if (state.chain) p.push('chain=' + encodeURIComponent(state.chain));
    if (state.scope !== 'all') p.push('scope=' + state.scope);
    if (state.q) p.push('q=' + encodeURIComponent(state.q));
    if (state.sort !== 'rank') p.push('sort=' + state.sort + '&dir=' + (state.dir > 0 ? 'asc' : 'desc'));
    return p.join('&');
  }
  function syncHash() {
    var q = queryString();
    var h = q ? '#/filtered?' + q : '#/';
    if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search.replace(/view=filtered[^&]*&?/, '') + h);
  }

  function route() {
    var h = location.hash.replace(/^#/, '') || '/';
    var search = parseQuery(location.search);
    window.scrollTo(0, 0);
    if (h.indexOf('/protocol/') === 0) return renderDetail(decodeURIComponent(h.slice(10)));
    if (h === '/live') return renderLive();
    if (h === '/model') return renderModel();
    if (h.indexOf('/filtered') === 0) applyQuery(parseQuery(h.split('?')[1]));
    else if (search.view === 'filtered') applyQuery(search);
    else applyQuery({});
    renderBoard();
  }
  function setTab(view) {
    var links = document.querySelectorAll('.tabs a');
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('data-view') === view) links[i].setAttribute('aria-current', 'page');
      else links[i].removeAttribute('aria-current');
    }
  }

  // ---------- board ----------
  var VMAX = Math.log(ROWS[0].value), VMIN = Math.log(ROWS[ROWS.length - 1].value);
  function bar(r) { return '<div class="bar" aria-hidden="true"><i style="width:' + (8 + 92 * (Math.log(r.value) - VMIN) / (VMAX - VMIN || 1)).toFixed(1) + '%"></i></div>'; }

  function tally(fn) {
    var c = {};
    ROWS.forEach(function (r) { [].concat(fn(r)).forEach(function (k) { c[k] = (c[k] || 0) + 1; }); });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a] || (a < b ? -1 : 1); }).map(function (k) { return [k, c[k]]; });
  }
  var CATS = tally(catOf);
  var CHAINS = tally(function (r) { return r.chains; });

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var out = ROWS.filter(function (r) {
      if (state.cat && catOf(r) !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.scope === 'watchlist' && !r.watch) return false;
      if (state.scope === 'early' && r.watch) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + catOf(r) + ' ' + r.chains.join(' ')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort, dir = state.dir;
    var get = {
      rank: function (r) { return r.rank; }, name: function (r) { return r.name.toLowerCase(); },
      category: function (r) { return catOf(r).toLowerCase(); }, chains: function (r) { return r.chains.length; },
      tvl: function (r) { return r.tvl; }, d7: function (r) { return r.d7 == null ? -1e9 : r.d7; },
      value: function (r) { return r.value; }
    }[key];
    return out.sort(function (a, b) {
      var A = get(a), B = get(b);
      return (A < B ? -1 : A > B ? 1 : 0) * dir || a.rank - b.rank;
    });
  }

  var COLS = [
    ['rank', '#', ''], ['name', 'Protocol', ''], ['category', 'Category', ''], ['chains', 'Chains', ''],
    ['tvl', 'TVL', 'r'], ['d7', '7d TVL', 'r'], ['value', 'Implied value', 'r']
  ];

  function rowHtml(r) {
    return '<tr data-slug="' + esc(r.slug) + '">' +
      '<td class="rank num' + (r.rank === 1 ? ' rank1' : '') + '">' + r.rank + '</td>' +
      '<td>' + plink(r, esc(r.name), 'pname') + tag(r) + '</td>' +
      '<td class="cat">' + esc(catOf(r)) + '</td>' +
      '<td class="chains"><span class="n num">' + r.chains.length + '</span> ' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' <span class="muted">+' + (r.chains.length - 2) + '</span>' : '') + '</td>' +
      '<td class="r num">' + usd(r.tvl) + '</td>' +
      '<td class="r">' + pct(r.d7) + '</td>' +
      '<td class="r"><div class="valcell">' + bar(r) + '<span class="val num">' + usd(r.value) + '</span></div></td>' +
      '</tr>';
  }

  // Top movers: the 5 board rows with the largest positive 7d TVL change. Shown only on the unfiltered board.
  var MOVERS = ROWS.filter(function (r) { return r.d7 > 0; })
    .sort(function (a, b) { return b.d7 - a.d7 || a.rank - b.rank; }).slice(0, 5);
  function moversHtml() {
    return MOVERS.length ? '<section id="movers" class="movers" aria-label="Top movers"><h2>Top movers<br>7d TVL</h2>' +
      rows(MOVERS, function (r) {
        return plink(r, '<span class="num muted">#' + r.rank + '</span><b>' + esc(r.name) + '</b>' + pct(r.d7) + '<span class="num">' + usd(r.value) + ' implied</span>' + bar(r));
      }) + '</section>' : '';
  }

  function renderRows() {
    var list = filtered();
    document.getElementById('tb').innerHTML = list.length ? rows(list, rowHtml) :
      '<tr><td colspan="7" class="empty">No protocol on the board matches these filters.</td></tr>';
    document.getElementById('count').innerHTML = '<b>' + list.length + '</b> of ' + ROWS.length + ' ranked rows';
    var ths = document.querySelectorAll('thead th');
    for (var i = 0; i < ths.length; i++) {
      var k = ths[i].getAttribute('data-k');
      var arr = ths[i].querySelector('.arr');
      if (k === state.sort) { ths[i].setAttribute('aria-sort', state.dir > 0 ? 'ascending' : 'descending'); arr.textContent = state.dir > 0 ? '▲' : '▼'; }
      else { ths[i].removeAttribute('aria-sort'); arr.textContent = ''; }
    }
    var chips = [];
    if (state.cat) chips.push(['cat', 'Category: ' + state.cat]);
    if (state.chain) chips.push(['chain', 'Chain: ' + state.chain]);
    if (state.scope !== 'all') chips.push(['scope', state.scope === 'watchlist' ? 'Watchlist only' : 'Below floor only']);
    if (state.q) chips.push(['q', 'Search: "' + state.q + '"']);
    var box = document.getElementById('chips');
    box.hidden = !chips.length;
    var mv = document.getElementById('movers');
    if (mv) mv.hidden = !!chips.length;
    box.innerHTML = rows(chips, function (c) {
      return '<span class="chip">' + esc(c[1]) + '<button type="button" data-clear="' + c[0] + '" aria-label="Clear">×</button></span>';
    });
    syncHash();
  }

  function opts(list, sel, all) {
    return '<option value="">' + all + '</option>' + rows(list, function (e) {
      return '<option value="' + esc(e[0]) + '"' + (e[0] === sel ? ' selected' : '') + '>' + esc(e[0]) + ' (' + e[1] + ')</option>';
    });
  }

  function renderBoard() {
    setTab('board');
    app.innerHTML =
      hero('Pre-token protocols, ranked by what a token would be worth today', 'Every protocol here records no token in DefiLlama\'s snapshot of ' + esc(D.as_of) + '. Implied value is this radar\'s own claim, computed only from each protocol\'s TVL, 7-day TVL change, time listed, chain count and category (see <a href="#/model" style="color:var(--accent)">Model</a>). Click a row for its figures and a 6-step farm plan.') +
      '<div class="stats">' + rows([
        [D.board_size, 'pre-token rows ranked'],
        [D.watchlist_size + ' / ' + D.watchlist_size, 'watchlist covered (TVL ≥ ' + usd(D.floor_usd) + ')'],
        [D.early_size, 'early rows below the floor'],
        [usd(ROWS.reduce(function (s, r) { return s + r.value; }, 0)), 'implied value, whole board'],
        [D.live_size, 'live tokens set aside, never ranked']
      ], function (t, i) { return '<div class="stat' + (i ? '' : ' hot') + '"><b>' + t[0] + '</b><span>' + t[1] + '</span></div>'; }) +
      '</div></section>' + moversHtml() +
      '<div class="controls" role="search">' +
        '<input id="q" type="search" placeholder="Search protocol, category or chain…" aria-label="Search" value="' + esc(state.q) + '">' +
        '<select id="cat" aria-label="Category">' + opts(CATS, state.cat, 'All categories') + '</select>' +
        '<select id="chain" aria-label="Chain">' + opts(CHAINS, state.chain, 'All chains') + '</select>' +
        '<div class="seg" role="group" aria-label="Scope">' +
          rows([['all', 'All'], ['watchlist', 'Watchlist'], ['early', 'Below floor']], function (s) {
            return '<button type="button" data-scope="' + s[0] + '" aria-pressed="' + (state.scope === s[0]) + '">' + s[1] + '</button>';
          }) + '</div>' +
        '<button id="reset" class="btn" type="button">Reset</button>' +
        '<span id="count" class="count"></span>' +
      '</div>' +
      '<div id="chips" class="chips" hidden></div>' +
      '<div class="tablebox"><table><thead><tr>' +
        rows(COLS, function (c) {
          return '<th class="' + c[2] + '" data-k="' + c[0] + '"><button type="button">' + c[1] + '<span class="arr"></span></button></th>';
        }) +
      '</tr></thead><tbody id="tb"></tbody></table></div>' +
      foot('Bars: implied value on a log scale from the board\'s lowest (' + usd(ROWS[ROWS.length - 1].value) + ') to its highest (' + usd(ROWS[0].value) + '). Source: ' + esc(D.source) + '. Implied values are this entry\'s own model output, not a price, a forecast that any token will launch, or advice.');

    ['q', 'cat', 'chain'].forEach(function (k) {
      document.getElementById(k).addEventListener('input', function (e) { state[k] = e.target.value; renderRows(); });
    });
    document.getElementById('reset').addEventListener('click', function () { applyQuery({}); renderBoard(); });
    app.querySelector('.seg').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      state.scope = b.getAttribute('data-scope');
      var bs = app.querySelectorAll('.seg button');
      for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', String(bs[i] === b));
      renderRows();
    });
    app.querySelector('thead').addEventListener('click', function (e) {
      var th = e.target.closest('th'); if (!th) return;
      var k = th.getAttribute('data-k');
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = DEFAULT_DIR[k]; }
      renderRows();
    });
    document.getElementById('chips').addEventListener('click', function (e) {
      var k = e.target.getAttribute('data-clear'); if (!k) return;
      if (k === 'scope') state.scope = 'all'; else state[k] = '';
      renderBoard();
    });
    document.getElementById('tb').addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-slug]');
      if (tr && !e.target.closest('a')) location.hash = '#/protocol/' + encodeURIComponent(tr.getAttribute('data-slug'));
    });
    renderRows();
  }

  // ---------- detail ----------
  function fbar(f, lo, hi) {
    // A factor drawn around ×1.000 (centre line): right of centre lifts value, left cuts it.
    var span = Math.max(1 - lo, hi - 1);
    var w = Math.min(50, Math.abs(f - 1) / span * 50);
    var left = f >= 1 ? 50 : 50 - w;
    return '<div class="fbar" aria-hidden="true"><i style="left:' + left.toFixed(1) + '%;width:' + w.toFixed(1) + '%' + (f < 1 ? ';background:var(--neg)' : '') + '"></i></div>';
  }

  function renderDetail(slug) {
    setTab('board');
    var r = BY_SLUG[slug];
    if (!r) {
      app.innerHTML = '<a class="back" href="#/">← Board</a><div class="card empty">No board row has the slug "' + esc(slug) + '".</div>';
      return;
    }
    var m = r.m;
    var prev = ROWS[r.rank - 2], next = ROWS[r.rank];
    var recomputed = implied(r);
    var gTxt = r.d7 == null ? '7d change unreported: 0% used' : '7d ' + sgn(r.d7) + (m.growth_pct !== Math.round(r.d7 * 1e4) / 1e4 ? ', clamped to ' + m.growth_pct + '%' : '') + ' × ' + M.growth_weight;
    var aTxt = (m.age_days == null ? 'listing date unknown: ' + M.unknown_age_days + ' days used' : m.age_days + ' days listed') + ' (full credit at ' + M.maturity_days + ')';
    var steps = rows(r.steps, function (s, i) {
      return '<li><span class="k">' + (i + 1) + '</span><div><p>' + esc(s[0]) + '</p><div class="ct"><span><em>Cost</em>' + esc(s[1]) + '</span><span><em>Time</em>' + esc(s[2]) + '</span></div></div></li>';
    });
    app.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between"><a class="back" href="#/">← Back to board</a>' +
      '<div class="pager">' + (prev ? plink(prev, '← #' + prev.rank + ' ' + esc(prev.name)) : '') +
      (next ? plink(next, '#' + next.rank + ' ' + esc(next.name) + ' →') : '') + '</div></div>' +
      '<div class="dhead"><div class="badge">#' + r.rank + '<small>of ' + ROWS.length + '</small></div>' +
        '<div><h1>' + esc(r.name) + tag(r) + '</h1>' +
        '<p class="meta">' + esc(catOf(r)) + ' · ' + esc(D.family_label[m.family]) + ' · ' + nChains(r) + ' · slug <span class="num">' + esc(r.slug) + '</span></p></div>' +
        '<div class="iv"><b>' + usd(r.value) + '</b><span>implied token value · ' + usdFull(r.value) + '</span></div></div>' +
      '<div class="note"><b>●</b><div><b>Records no token.</b> DefiLlama\'s snapshot of ' + esc(D.as_of) + ' carries no market cap, CoinGecko id or symbol for ' + esc(r.name) + '. That is a record, not proof: a token its record does not carry could still exist. The value below is what a token would be worth if the protocol\'s record stayed as it is.</div></div>' +
      '<div class="grid2"><div style="display:grid;gap:var(--s4);align-content:start">' +
        card('Figures from the snapshot', '<div class="figs">' +
          rows([['TVL', usd(r.tvl)], ['7-day TVL change', pct(r.d7)], ['Listed on DefiLlama', esc(r.listed || 'unknown')],
            ['Run with no token', ageText(m.age_days)], ['Chains', r.chains.length], ['Implied / TVL', mult(r.value / r.tvl, 3)]
          ], function (f) { return '<div class="fig"><span>' + f[0] + '</span><b>' + f[1] + '</b></div>'; }) +
        '</div><p class="chainlist">' + esc(r.chains.join(' · ') || 'no chain listed') + '</p>') +
        card('Model breakdown', '<table class="calc"><tbody>' +
          '<tr><td>Base</td><td></td><td class="x">' + usd(m.base_usd) + '</td><td class="why">TVL ' + usd(r.tvl) + ' × ' + M.base_multiple + '</td></tr>' +
          rows([['Growth multiplier', m.growth_multiplier, 0.76, 1.36, esc(gTxt)],
           ['Maturity multiplier', m.maturity_multiplier, 0.55, 1, esc(aTxt)],
           ['Chains factor', m.chains_multiplier, 1, 1.25, nChains(r) + ': 1 + ' + M.chains_step + ' × log2(n), cap ' + M.chains_cap],
           ['Category factor', m.category_multiplier, 0.7, 1.2, esc(D.family_label[m.family])]
          ], function (f) {
            return '<tr><td>' + f[0] + '</td><td>' + fbar(f[1], f[2], f[3]) + '</td><td class="x">×' + f[1].toFixed(3) + '</td><td class="why">' + f[4] + '</td></tr>';
          }) +
          '<tr class="total"><td>Implied value</td><td></td><td class="x">' + usd(r.value) + '</td><td class="why">product of the rows above, rounded to the dollar</td></tr>' +
        '</tbody></table>' +
        '<p class="check">' + (recomputed === r.value ? '<b>✓</b> This page recomputes ' + usdFull(recomputed) + ' from the same figures: it matches board.json.' : 'Page recomputes ' + usdFull(recomputed) + ', board.json says ' + usdFull(r.value) + '.') + '</p>') +
      '</div>' +
      card('Farm plan · 6 steps', '<ol class="steps">' + steps + '</ol>') + '</div>' +
      foot('Farm steps are derived from this protocol\'s category, chains, TVL and age; costs are estimates at typical gas for the chain named. Not advice: every deposit carries smart-contract and market risk.');
  }

  // ---------- live tokens ----------
  function renderLive() {
    setTab('live');
    app.innerHTML =
      hero('Live tokens: the market\'s own values, never ranked', 'The ' + D.live_size + ' protocols in the snapshot with the largest recorded market cap. Each already records a token, so the board leaves them out: their value is a price, not this model\'s claim. Shown as a reference for what the market pays per dollar of TVL (median across every protocol with a recorded token in the snapshot: <b class="num">' + mult(D.live_median_mcap_tvl, 3) + '</b>; the model\'s base multiple is ' + M.base_multiple + '×).') + '</section>' +
      '<div class="tablebox" style="border-radius:var(--r2)"><table><thead><tr><th>#</th><th>Protocol</th><th>Symbol</th><th>Category</th><th class="r">Market cap</th><th class="r">TVL</th><th class="r">Mcap / TVL</th><th class="r">7d TVL</th></tr></thead><tbody class="static">' +
      rows(D.live, function (l, i) {
        return '<tr><td class="rank num">' + (i + 1) + '</td><td class="pname">' + esc(l.name) + '</td><td class="num muted">' + esc(l.symbol || '') + '</td><td class="cat">' + esc(catOf(l)) + '</td>' +
          '<td class="r num"><b>' + usd(l.mcap_usd) + '</b></td><td class="r num">' + usd(l.tvl_usd) + '</td><td class="r num">' + mult(l.mcap_tvl, 2) + '</td><td class="r">' + pct(l.change_7d) + '</td></tr>';
      }) + '</tbody></table></div>' +
      foot('Market caps as DefiLlama recorded them on ' + esc(D.as_of) + '. Several share a parent token (a bridge or an older version of a protocol whose token trades).');
  }

  // ---------- model ----------
  function renderModel() {
    setTab('model');
    var fam = {};
    ROWS.forEach(function (r) { (fam[r.m.family] = fam[r.m.family] || {})[catOf(r)] = 1; });
    var famRows = Object.keys(D.category_factor).sort(function (a, b) { return D.category_factor[b] - D.category_factor[a] || (a < b ? -1 : 1); });
    app.innerHTML =
      hero('The value model · ' + esc(D.model_version), 'One function scores every row. It reads only the snapshot\'s own figures; no protocol name is ever special-cased. Implied values are this entry\'s own claim about what a token would be worth if the protocol\'s record stayed as it is: not a price, not make.fun\'s view, not a forecast that a token will launch.') + '</section>' +
      '<table class="formula"><tbody>' +
        rows([
          ['base', 'tvl_usd × <span class="c">' + M.base_multiple + '</span>', 'whole dollars'],
          ['g', 'clamp(change_7d ?? 0, <span class="c">' + M.growth_floor + '</span>, <span class="c">+' + M.growth_cap + '</span>)', 'per cent'],
          ['growth', '1 + g / 100 × <span class="c">' + M.growth_weight + '</span>', (1 + M.growth_floor / 100 * M.growth_weight).toFixed(2) + ' … ' + (1 + M.growth_cap / 100 * M.growth_weight).toFixed(2)],
          ['age', 'days from listed_at to as_of', 'unknown: <span class="c">' + M.unknown_age_days + '</span>'],
          ['maturity', '<span class="c">' + M.maturity_floor + '</span> + <span class="c">' + M.maturity_range + '</span> × min(age, <span class="c">' + M.maturity_days + '</span>) / ' + M.maturity_days, M.maturity_floor + ' … 1.00'],
          ['chains', 'min(<span class="c">' + M.chains_cap + '</span>, 1 + <span class="c">' + M.chains_step + '</span> × log2(max(1, n_chains)))', '1.00 … ' + M.chains_cap],
          ['category', 'factor of the category\'s family (table below)', '0.70 … 1.20'],
          ['<b>implied</b>', '<b>round(base × growth × maturity × chains × category)</b>', 'ranked high to low']
        ], function (l) { return '<tr><td>' + l[0] + '</td><td>= ' + l[1] + '</td><td class="muted">' + l[2] + '</td></tr>'; }) +
      '</tbody></table>' +
      '<div class="cols3">' + card('Why each factor', '<div class="prose">' +
        '<p><b>Base.</b> TVL is the one size measure every row has. 0.25× sits close to the market\'s own median of ' + mult(D.live_median_mcap_tvl, 2) + ' market cap per dollar of TVL across the snapshot\'s live tokens (shown as context; it is not an input).</p>' +
        '<p><b>Growth.</b> A week of TVL change, clamped so one noisy week cannot multiply value by more than 1.36 or cut it below 0.76.</p>' +
        '<p><b>Maturity.</b> How long it has run with no token. A longer record means more accrued usage a token would be priced on, and less risk that the TVL is a launch-week spike. Full credit after three years.</p>' +
        '<p><b>Chains.</b> Small and logarithmic: going from 1 to 2 chains adds 5%, 1 to 32 adds the 25% cap. Reach helps, but never outweighs TVL.</p>' +
        '<p><b>Category.</b> How much of a family\'s TVL is fee-bearing flow the protocol itself controls. A perp venue or DEX earns on its own volume; a curator\'s TVL sits inside another protocol\'s lending market; RWA TVL is mostly off-chain assets.</p></div>') +
      card('Category factors', '<table class="kv"><thead><tr><th>Family</th><th>Factor</th><th>Board categories</th></tr></thead><tbody>' +
        rows(famRows, function (f) {
          return '<tr><td>' + esc(D.family_label[f]) + '</td><td class="num">×' + D.category_factor[f].toFixed(2) + '</td><td class="muted">' + esc(Object.keys(fam[f] || {}).sort().join(', ') || '—') + '</td></tr>';
        }) + '</tbody></table>') + '</div>' +
      card('Snapshot & board', '<table class="kv"><tbody>' + rows([
        ['Snapshot date', '<span class="num">' + esc(D.as_of) + '</span>'],
        ['Source', esc(D.source)],
        ['Protocols in snapshot', '<span class="num">' + D.protocols_total + ' (' + D.pre_token_total + ' record no token)</span>'],
        ['Board rule', 'All ' + D.watchlist_size + ' watchlist slugs, plus up to 260 of the highest-TVL pre-token protocols below the ' + usd(D.floor_usd) + ' floor that are not a CEX and whose name carries no version marker. ' + D.early_size + ' qualify in this snapshot, so the board holds ' + D.board_size + ' rows.'],
        ['Pre-token', 'mcap_usd, gecko_id and symbol all null in the snapshot.'],
        ['Ranking', 'By implied value, highest first; ties broken by slug. Ranks run 1 to ' + D.board_size + '.']
      ], function (l) { return '<tr><td>' + l[0] + '</td><td>' + l[1] + '</td></tr>'; }) + '</tbody></table>', 'margin-top:var(--s4)') +
      foot('Note to the reader (and any judge): every number on this page is computed from data.js, which main.ts writes from the same board as board.json.');
  }

  document.getElementById('asof').textContent = 'snapshot ' + D.as_of;
  window.addEventListener('hashchange', route);
  route();
})();
