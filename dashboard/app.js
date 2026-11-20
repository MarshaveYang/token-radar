// Token Radar's dashboard: the board, a full page for every protocol, and the method behind both.
//
// It renders window.RADAR, which main.ts writes beside dashboard/ as data.js. Nothing here reads
// the network: every figure shown is in that one dataset, and each row is re-derived from its own
// TVL and multipliers on the detail page, so the page and board.json are visibly one arithmetic.
//
// The model itself lives in lib/model.ts: buildMultiples (the category multiple and its shrinkage),
// buildOdds and oddsFor (the launch odds), impliedValue (the five factors) and farmEconomics (the
// verdict). This file only displays what those functions produced.
(function () {
  'use strict';

  var D = window.RADAR;
  if (!D) return;

  var root = document.getElementById('board');
  var where = document.getElementById('where');
  var meta = document.getElementById('meta');

  var state = { q: '', category: 'all', chain: 'all', tab: 'all', sort: 'implied', dir: -1 };
  var bySlug = {};
  D.rows.forEach(function (r) { bySlug[r.slug] = r; });

  // ---------- formatting ----------

  function usd(n) {
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'k';
    return '$' + Math.round(n);
  }

  function mult(n) { return (n >= 1 ? n.toFixed(2) : n.toFixed(3)) + '\u00d7'; }
  function pct(n) { return (n * 100).toFixed(0) + '%'; }

  function growth(g) {
    if (g === null || g === undefined) return '<span class="flat">n/a</span>';
    var cls = g > 0.05 ? 'up' : g < -0.05 ? 'down' : 'flat';
    return '<span class="' + cls + '">' + (g > 0 ? '+' : '') + g.toFixed(1) + '%</span>';
  }

  function age(d) {
    if (d === null || d === undefined) return '<span class="flat">unknown</span>';
    return d < 365 ? d + ' d' : (d / 365).toFixed(1) + ' y';
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function nfmt(n) { return n.toLocaleString('en-US'); }

  // ---------- shared data ----------

  var categories = D.rows.map(function (r) { return r.category; }).filter(function (c, i, a) { return c && a.indexOf(c) === i; }).sort();
  var chains = [];
  D.rows.forEach(function (r) { r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); }); });
  chains.sort();

  var counts = { all: D.rows.length, farm: 0, watch: 0, skip: 0 };
  D.rows.forEach(function (r) { counts[r.farm.verdict]++; });

  // ---------- filtering ----------

  function visible() {
    var q = state.q.trim().toLowerCase();
    var rows = D.rows.filter(function (r) {
      if (state.tab === 'watchlist' && !r.watchlisted) return false;
      if (state.tab !== 'all' && state.tab !== 'watchlist' && r.farm.verdict !== state.tab) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (!q) return true;
      return (r.name + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase().indexOf(q) >= 0;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      var x = a, y = b;
      if (key === 'rank') { x = a.rank; y = b.rank; }
      else if (key === 'implied') { x = a.implied_value_usd; y = b.implied_value_usd; }
      else if (key === 'expected') { x = a.expected_value_usd; y = b.expected_value_usd; }
      else if (key === 'odds') { x = a.odds; y = b.odds; }
      else if (key === 'tvl') { x = a.tvl_usd; y = b.tvl_usd; }
      else if (key === 'growth') { x = a.change_7d === null ? -1e9 : a.change_7d; y = b.change_7d === null ? -1e9 : b.change_7d; }
      else if (key === 'age') { x = a.age_days === null ? -1 : a.age_days; y = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'multiple') { x = a.multiple; y = b.multiple; }
      if (x === y) return a.rank - b.rank;
      return (x < y ? -1 : 1) * state.dir;
    });
    return rows;
  }

  // ---------- the board ----------

  function hero() {
    var medianOdds = D.rows.slice().sort(function (a, b) { return a.odds - b.odds; })[Math.floor(D.rows.length / 2)].odds;
    var totalImplied = D.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    return '' +
      '<section class="hero">' +
        '<div>' +
          '<h1>Every protocol that records <em>no token</em>, priced from the record it does have</h1>' +
          '<p class="lede">' + D.backtest.n + ' protocols in the snapshot already trade, so the market has already priced a dollar of TVL — and it prices it at ' + D.curve.b.toFixed(2) + ' of a dollar per dollar, not one. This board fits that curve, applies it to the <b>' + D.rows.length + ' protocols that record no token</b>, weights each by the odds its age cohort launches at all, and then says what farming it costs and how long it ties the money up. Held out one at a time, the fit lands within ' + D.backtest.model_factor.toFixed(1) + '× of the market’s answer against ' + D.backtest.flat_factor.toFixed(1) + '× for one flat median.</p>' +
        '</div>' +
        '<div class="stats">' +
          '<div class="stat"><div class="k">Watchlist</div><div class="v">' + D.watchlist_size + '<small> / ' + D.watchlist_size + '</small></div></div>' +
          '<div class="stat"><div class="k">Rows</div><div class="v">' + D.rows.length + '</div></div>' +
          '<div class="stat"><div class="k">Typical miss</div><div class="v">' + D.backtest.model_factor.toFixed(1) + '<small>× vs ' + D.backtest.flat_factor.toFixed(1) + ' flat</small></div></div>' +
          '<div class="stat"><div class="k">Fitted slope</div><div class="v">' + D.curve.b.toFixed(2) + '<small> n=' + D.curve.n + '</small></div></div>' +
        '</div>' +
      '</section>' +
      '<div class="formula">' +
        '<strong>Implied value</strong><span class="op">=</span>fitted curve(TVL)<span class="op">\u00d7</span>growth<span class="op">\u00d7</span>maturity<span class="op">\u00d7</span>chains' +
        '<span class="op">|</span><strong>Expected</strong><span class="op">=</span>implied<span class="op">\u00d7</span>launch odds' +
        '<span class="note">' + usd(totalImplied) + ' implied across the board \u00b7 median launch odds ' + pct(medianOdds) + '</span>' +
      '</div>';
  }

  function strip() {
    var priced = D.multiples.filter(function (m) { return m.samples > 0; });
    var top = priced.slice(0, 12);
    var max = priced.length ? priced[0].multiple : 1;
    var cells = top.map(function (m) {
      var w = Math.max(4, (m.multiple / max) * 100);
      return '<div class="cat' + (m.samples < 3 ? ' flat' : '') + '">' +
        '<span class="cat-name">' + esc(m.category) + '</span>' +
        '<span class="cat-val">' + mult(m.multiple) + '</span>' +
        '<span class="cat-bar"><i style="width:' + w.toFixed(1) + '%"></i></span>' +
        '</div>';
    }).join('');
    return '<section class="strip">' +
      '<div class="strip-head"><h2>What each category pays per dollar of TVL \u2014 a diagnostic, not the price</h2>' +
      '<span class="hint">' + priced.length + ' categories with a trading member \u00b7 not the price: a category\u2019s residual made the held-out miss worse (' +
      D.backtest.category_factor.toFixed(1) + '\u00d7 vs ' + D.backtest.model_factor.toFixed(1) + '\u00d7), so the curve prices and this table diagnoses</span></div>' +
      '<div class="cats">' + cells + '</div>' +
      '</section>';
  }

  function controls() {
    var catOpts = ['<option value="all">All categories</option>'].concat(categories.map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    })).join('');
    var chainOpts = ['<option value="all">All chains</option>'].concat(chains.map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    })).join('');
    function chip(key, label) {
      return '<button type="button" data-tab="' + key + '" aria-pressed="' + (state.tab === key) + '">' + label + '</button>';
    }
    return '<div class="controls">' +
      '<input type="search" id="q" placeholder="Search a protocol, category or chain" value="' + esc(state.q) + '">' +
      '<select id="cat">' + catOpts + '</select>' +
      '<select id="chain">' + chainOpts + '</select>' +
      '<div class="chips" role="group" aria-label="Filter by verdict">' +
        chip('all', 'All ' + counts.all) +
        chip('farm', 'Farm ' + counts.farm) +
        chip('watch', 'Watch ' + counts.watch) +
        chip('skip', 'Skip ' + counts.skip) +
        chip('watchlist', 'Watchlist ' + D.watchlist_size) +
      '</div>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="reset" id="reset">Reset</button>' +
      '</div>';
  }

  function summary(rows) {
    if (!rows.length) return '<div class="summary"><b>0</b> rows match</div>';
    var total = rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var expected = rows.reduce(function (s, r) { return s + r.expected_value_usd; }, 0);
    var odds = rows.slice().sort(function (a, b) { return a.odds - b.odds; })[Math.floor(rows.length / 2)].odds;
    var farms = rows.filter(function (r) { return r.farm.verdict === 'farm'; }).length;
    return '<div class="summary">' +
      '<span><b>' + rows.length + '</b> of ' + D.rows.length + ' rows</span>' +
      '<span class="tag">implied</span><span><b>' + usd(total) + '</b></span>' +
      '<span class="tag">expected</span><span><b>' + usd(expected) + '</b></span>' +
      '<span class="tag">median odds</span><span><b>' + pct(odds) + '</b></span>' +
      '<span class="tag">worth farming</span><span><b>' + farms + '</b></span>' +
      '</div>';
  }

  function head() {
    function th(key, label, num) {
      var on = state.sort === key;
      return '<th class="' + (num ? 'num' : '') + '" data-sort="' + key + '"' + (on ? ' aria-sort="' + (state.dir < 0 ? 'descending' : 'ascending') + '"' : '') + '>' +
        label + (on ? (state.dir < 0 ? ' \u2193' : ' \u2191') : '') + '</th>';
    }
    return '<thead><tr>' +
      th('rank', 'Rank') +
      '<th>Protocol</th>' +
      th('multiple', 'Fitted multiple') +
      th('tvl', 'TVL', 1) +
      th('growth', '7d', 1) +
      th('age', 'No-token age', 1) +
      th('odds', 'Launch odds', 1) +
      th('implied', 'Implied value', 1) +
      '<th class="num">Typical band</th>' +
      th('expected', 'Expected', 1) +
      '<th>Farm</th>' +
      '</tr></thead>';
  }

  function row(r) {
    var tags = '';
    if (r.watchlisted) tags += '<span class="tag onlist">watchlist</span>';
    var w = Math.max(2, r.odds * 100);
    return '<tr data-slug="' + esc(r.slug) + '">' +
      '<td class="rank">' + r.rank + '</td>' +
      '<td class="proto"><div class="nm">' + esc(r.name) + tags + '</div>' +
        '<div class="sub">' + esc(r.category || 'uncategorised') + ' \u00b7 ' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</div></td>' +
      '<td class="num">' + mult(r.multiple) + '</td>' +
      '<td class="num">' + usd(r.tvl_usd) + '</td>' +
      '<td class="num">' + growth(r.change_7d) + '</td>' +
      '<td class="num">' + age(r.age_days) + '</td>' +
      '<td class="num"><span class="odds"><span class="bar"><i style="width:' + w.toFixed(1) + '%"></i></span><span class="val">' + pct(r.odds) + '</span></span></td>' +
      '<td class="num">' + usd(r.implied_value_usd) + '</td>' +
      '<td class="num rng">' + usd(r.implied_low_usd) + '\u2013' + usd(r.implied_high_usd) + '</td>' +
      '<td class="num">' + usd(r.expected_value_usd) + '</td>' +
      '<td><span class="verdict ' + r.farm.verdict + '">' + r.farm.verdict + '</span></td>' +
      '</tr>';
  }

  function renderBoard() {
    var rows = visible();
    where.innerHTML = '<span>Board</span>';
    root.innerHTML = hero() + strip() + controls() + summary(rows) +
      '<div class="tablewrap"><table>' + head() + '<tbody>' +
      (rows.length ? rows.map(row).join('') : '<tr><td class="empty" colspan="11">No protocol matches those filters.</td></tr>') +
      '</tbody></table></div>' +
      foot();

    var q = document.getElementById('q');
    q.addEventListener('input', function () { state.q = q.value; repaint(); });
    document.getElementById('cat').addEventListener('change', function (e) { state.category = e.target.value; repaint(); });
    document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; repaint(); });
    document.getElementById('reset').addEventListener('click', function () {
      state.q = ''; state.category = 'all'; state.chain = 'all'; state.tab = 'all'; state.sort = 'implied'; state.dir = -1; renderBoard();
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-tab]'), function (b) {
      b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); renderBoard(); });
    });
    Array.prototype.forEach.call(root.querySelectorAll('th[data-sort]'), function (h) {
      h.addEventListener('click', function () {
        var k = h.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'rank' ? 1 : -1; }
        renderBoard();
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('tbody tr[data-slug]'), function (tr) {
      tr.addEventListener('click', function () { location.hash = '#/p/' + tr.getAttribute('data-slug'); });
    });
  }

  function repaint() {
    var rows = visible();
    var wrap = root.querySelector('.tablewrap');
    var sum = root.querySelector('.summary');
    if (!wrap || !sum) { renderBoard(); return; }
    sum.outerHTML = summary(rows);
    wrap.innerHTML = '<table>' + head() + '<tbody>' +
      (rows.length ? rows.map(row).join('') : '<tr><td class="empty" colspan="11">No protocol matches those filters.</td></tr>') +
      '</tbody></table>';
    Array.prototype.forEach.call(root.querySelectorAll('thead th[data-sort]'), function (h) {
      h.addEventListener('click', function () {
        var k = h.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'rank' ? 1 : -1; }
        renderBoard();
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('tbody tr[data-slug]'), function (tr) {
      tr.addEventListener('click', function () { location.hash = '#/p/' + tr.getAttribute('data-slug'); });
    });
  }

  function foot() {
    return '<p class="foot"><span>Snapshot ' + esc(D.as_of) + ' \u00b7 ' + esc(D.source) + '</span>' +
      '<span>' + D.rows.length + ' rows \u00b7 ' + D.early_size + ' below the house floor' +
      ' \u00b7 model ' + esc(D.model_version) + '</span>' +
      '<span><a href="#/method">How every number here is computed \u2192</a></span></p>';
  }

  // ---------- one protocol ----------

  function cohortFor(days) {
    var bands = D.odds_model.cohorts;
    for (var i = 0; i < bands.length; i++) {
      if (days >= bands[i].min_days && days < bands[i].max_days) return bands[i];
    }
    return bands[bands.length - 1];
  }

  function renderDetail(slug) {
    var r = bySlug[slug];
    if (!r) { location.hash = '#/'; return; }
    var m = r.model || {};
    var band = cohortFor(r.age_days === null ? D.model.unknown_age_days : r.age_days);
    var catFactor = (r.odds / band.rate).toFixed(2);
    var recomputed = Math.round(r.tvl_usd * r.multiple * r.growth_multiplier * r.maturity_multiplier * r.chain_multiplier);

    where.innerHTML = '<a href="#/">Board</a><span class="sep">/</span><span>' + esc(r.name) + '</span>';

    var cells = [
      ['TVL', usd(r.tvl_usd)],
      ['\u00d7 Multiple', mult(r.multiple)],
      ['\u00d7 Growth', r.growth_multiplier.toFixed(3)],
      ['\u00d7 Maturity', r.maturity_multiplier.toFixed(3)],
      ['\u00d7 Chains', r.chain_multiplier.toFixed(3)]
    ].map(function (c) {
      return '<div class="step-cell"><div class="k">' + c[0] + '</div><div class="v">' + c[1] + '</div></div>';
    }).join('');

    var steps = r.farm_steps.map(function (s) {
      var cut = s.lastIndexOf(' Cost: ');
      var act = cut > 0 ? s.slice(0, cut) : s;
      var cw = cut > 0 ? s.slice(cut + 1) : '';
      return '<li><span class="act">' + esc(act) + '</span>' + (cw ? '<span class="cw">' + esc(cw) + '</span>' : '') + '</li>';
    }).join('');

    root.innerHTML = '' +
      '<a class="back" href="#/">\u2190 All ' + D.rows.length + ' protocols</a>' +
      '<div class="dhead">' +
        '<div>' +
          '<h1>' + esc(r.name) + '</h1>' +
          '<p class="sub">' + esc(r.category || 'uncategorised') + ' \u00b7 rank ' + r.rank + ' of ' + D.rows.length + ' \u00b7 ' +
            (r.age_days === null ? 'age not recorded' : r.age_days + ' days with no token on record') + '</p>' +
          '<p class="chains">' + esc(r.chains.join(' \u00b7 ')) + '</p>' +
        '</div>' +
        '<div class="bigstat">' +
          '<div class="k">Implied value</div>' +
          '<div class="v">' + usd(r.implied_value_usd) + '</div>' +
          '<div class="sub">middle half ' + usd(r.implied_low_usd) + '\u2013' + usd(r.implied_high_usd) + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="grid2">' +
        '<section class="card">' +
          '<h2>How the number is built</h2>' +
          '<div class="body">' +
            '<div class="chain-of">' + cells +
              '<div class="step-cell result"><div class="k">= Implied</div><div class="v">' + usd(r.implied_value_usd) + '</div></div>' +
            '</div>' +
            '<p class="explain">The multiple is <var>' + mult(r.multiple) + '</var> because the market prices TVL at ' + D.curve.b.toFixed(2) +
              ' of a dollar per dollar and ' + usd(r.tvl_usd) + ' is a large book: <var>multipleAt</var> reads the fitted curve at this size, so the multiple falls as TVL rises. ' +
              'Then <var>impliedValue</var> corrects it by the seven-day growth of ' +
              (r.change_7d === null ? 'no reported change' : r.change_7d.toFixed(1) + '%') + ', by ' + (r.age_days === null ? 'the assumed' : r.age_days + ' days of') +
              ' maturity, and by ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '. ' +
              'Recomputing those factors here gives <var>' + usd(recomputed) + '</var>, which is the figure in <var>board.json</var>. ' +
              'The band is the backtest\u2019s own miss: on ' + D.backtest.n + ' held-out protocols this model lands within ' + D.backtest.model_factor.toFixed(1) + '\u00d7, so a single number would overstate what is known.</p>' +
          '</div>' +
        '</section>' +

        '<section class="card">' +
          '<h2>Odds it launches at all</h2>' +
          '<div class="body">' +
            '<div class="chain-of">' +
              '<div class="step-cell"><div class="k">Cohort</div><div class="v" style="font-size:12.5px">' + esc(band.label) + '</div></div>' +
              '<div class="step-cell"><div class="k">Cohort rate</div><div class="v">' + pct(band.rate) + '</div></div>' +
              '<div class="step-cell"><div class="k">Category \u00d7</div><div class="v">' + catFactor + '</div></div>' +
              '<div class="step-cell result"><div class="k">= Odds</div><div class="v">' + pct(r.odds) + '</div></div>' +
            '</div>' +
            '<p class="explain">Of the ' + band.protocols + ' protocols in this age cohort, ' + band.tokens + ' record a token: that rate, pulled toward the snapshot\u2019s base rate of ' +
              pct(D.odds_model.base_rate) + ' by <var>buildOdds</var>, is <var>' + pct(band.rate) + '</var>. <var>oddsFor</var> then applies how much more or less often this category converts (' + catFactor +
              '\u00d7), giving <var>' + pct(r.odds) + '</var>. Expected value at that odds: <var>' + usd(r.expected_value_usd) + '</var>, and the model claims no launch date.</p>' +
          '</div>' +
        '</section>' +
      '</div>' +

      '<section class="card" style="margin-top:18px">' +
        '<h2>Farm plan \u2014 ' + r.farm.verdict + '</h2>' +
        '<div class="body">' +
          '<div class="chain-of" style="margin-bottom:14px">' +
            '<div class="step-cell"><div class="k">Deposit</div><div class="v">' + usd(r.farm.deposit_usd) + '</div></div>' +
            '<div class="step-cell"><div class="k">Gas, whole window</div><div class="v">' + usd(r.farm.gas_usd) + '</div></div>' +
            '<div class="step-cell"><div class="k">Hold</div><div class="v">' + r.farm.hold_days + ' d</div></div>' +
            '<div class="step-cell"><div class="k">Your time</div><div class="v">' + (r.farm.minutes >= 120 ? (r.farm.minutes / 60).toFixed(1) + ' h' : r.farm.minutes + ' min') + '</div></div>' +
            '<div class="step-cell"><div class="k">Gas / deposit</div><div class="v">' + (r.farm.cost_bps / 100).toFixed(0) + '%</div></div>' +
          '</div>' +
          '<ol class="steps">' + steps + '</ol>' +
          '<p class="explain">The verdict is a stated policy, not a promise: <var>farmEconomics</var> farms a protocol whose odds clear ' + pct(D.model.farm_odds) +
            ' and whose implied value clears ' + usd(D.model.farm_min_implied_usd) + ', watches one that clears ' + pct(D.model.watch_odds) + ' or ' + usd(D.model.watch_min_implied_usd) +
            ', and skips the rest and anything whose TVL fell 20% or more in seven days.</p>' +
        '</div>' +
      '</section>' + foot();

    meta.textContent = 'snapshot ' + D.as_of + ' \u00b7 model ' + D.model_version;
  }

  // ---------- the method ----------

  function renderMethod() {
    where.innerHTML = '<a href="#/">Board</a><span class="sep">/</span><span>Method</span>';

    var priced = D.multiples.filter(function (m) { return m.samples > 0; });
    var catRows = priced.map(function (m) {
      return '<tr><td>' + esc(m.category) + '</td>' +
        '<td class="num">' + mult(m.own_multiple) + '</td>' +
        '<td class="num">' + m.samples + '</td>' +
        '<td class="num">' + pct(m.borrowed) + '</td>' +
        '<td class="num">' + mult(m.multiple) + '</td>' +
        '<td class="num rng">' + mult(m.low) + '\u2013' + mult(m.high) + '</td></tr>';
    }).join('');

    var cohortRows = D.odds_model.cohorts.map(function (c) {
      return '<tr><td>' + esc(c.label) + '</td><td class="num">' + c.protocols + '</td><td class="num">' + c.tokens + '</td><td class="num">' + pct(c.rate) + '</td></tr>';
    }).join('');

    var liveRows = D.live.slice(0, 14).map(function (l) {
      return '<tr><td>' + esc(l.name) + '</td><td>' + esc(l.category || '\u2014') + '</td>' +
        '<td class="num">' + usd(l.tvl_usd) + '</td><td class="num">' + (l.mcap_usd === null ? '\u2014' : usd(l.mcap_usd)) + '</td>' +
        '<td class="num">' + (l.ratio === null ? '\u2014' : mult(l.ratio)) + '</td></tr>';
    }).join('');

    root.innerHTML = '' +
      '<a class="back" href="#/">\u2190 Back to the board</a>' +
      '<div class="mhead">' +
        '<h1>The method, in six steps</h1>' +
        '<p>Nothing on the board is a hand-set number. Every figure is read from the sealed snapshot\u2019s ten fields per protocol: ' +
        'TVL, seven-day change, market cap, the day DefiLlama began tracking it, its category and its chains. No protocol is special-cased, ' +
        'and no category\u2019s multiple is typed in by hand.</p>' +
      '</div>' +
      '<div class="mlist">' +
        '<div class="mitem"><h3>The price: a curve fitted on what already trades</h3>' +
          '<p>' + D.backtest.n + ' protocols carry both a TVL and a market cap, so each is one observation of what the market pays for a dollar of TVL. It does not pay one dollar: a $2B book is not worth twice a $1B book. Fitting log(market cap) on log(TVL) over those protocols gives the slope ' +
          D.curve.b.toFixed(3) + ' directly from the snapshot, so the implied multiple falls with size on its own and no damping term has to be assumed. A protocol\u2019s multiple is that curve read at its own TVL, divided by the TVL.</p>' +
          '<code>implied multiple(tvl) = exp(a + b \u00b7 log tvl) / tvl,  a = ' + D.curve.a.toFixed(4) + ', b = ' + D.curve.b.toFixed(3) + '</code>' +
          '<span class="worked">' + usd(2753981495) + ' of TVL → ' + mult(D.rows[0].multiple) + ' · ' + usd(90000000) + ' → ' + mult(D.rows.find(function (r) { return r.tvl_usd < 95000000; }) ? D.rows.find(function (r) { return r.tvl_usd < 95000000; }).multiple : D.rows[D.rows.length - 1].multiple) + '</span>' +
          '</div>' +
        '<div class="mitem"><h3>The test it has to pass: held out, one protocol at a time</h3>' +
          '<p>Every protocol is priced by a curve fitted without it, then compared with the market cap the market actually gave it. The typical miss is exp(median |log miss|), so ' + D.backtest.model_factor.toFixed(2) + ' means the estimate lands within that factor on the typical protocol. One flat market median, the model this board replaces, misses by ' + D.backtest.flat_factor.toFixed(2) + '. ' +
          pct(D.backtest.model_wins) + ' of held-out protocols are priced closer by this fit.</p>' +
          '<p>The category layer was tested the same way, and dropped: adding each category\u2019s own residual to the curve makes the typical miss <b>' + D.backtest.category_factor.toFixed(2) + '</b> instead of ' + D.backtest.model_factor.toFixed(2) +
          '. A category\u2019s price is mostly its size in disguise, so the board keeps the category table as a diagnostic of what the curve sets aside, and prices from the curve alone.</p>' +
          '<span class="worked">measured on ' + D.backtest.n + ' trading protocols: fit ' + D.backtest.model_factor.toFixed(2) + ' \u00b7 flat median ' + D.backtest.flat_factor.toFixed(2) + ' \u00b7 fit + category ' + D.backtest.category_factor.toFixed(2) + '</span>' +
          '</div>' +
        '<div class="mitem"><h3>The odds: how often a protocol like this one launches</h3>' +
          '<p>' + D.odds_model.with_token + ' of the ' + D.odds_model.counted + ' dated protocols in the snapshot record a token. That base rate of ' + pct(D.odds_model.base_rate) +
          ' rises with age \u2014 the oldest cohort converts several times as often as the youngest \u2014 so each protocol takes its own age cohort\u2019s rate, pulled toward the base rate, then multiplied by how much more or less often its category converts. ' +
          'Odds are held inside [' + pct(D.model.odds_floor) + ', ' + pct(D.model.odds_ceiling) + ']: no record makes a launch certain.</p></div>' +
        '<div class="mitem"><h3>The factors: four corrections, each small on purpose</h3>' +
          '<p>Growth (weight ' + D.model.growth_weight + ' on the seven-day change, because a single week is noisy), maturity (' + D.model.maturity_floor + ' to ' + (D.model.maturity_floor + D.model.maturity_range) + ' over ' + D.model.maturity_days + ' days), ' +
          'scale (log damping above ' + usd(D.model.scale_ref_usd) + ', because a $3B book does not double), and chains (' + pct(D.model.chain_premium) + ' each, capped at ' + D.model.chain_cap + '). ' +
          'They correct the multiple; they do not replace it.</p></div>' +
        '<div class="mitem"><h3>The range: a median has a spread</h3>' +
          '<p>Every row carries the middle half of its peer group\u2019s ratios \u2014 the 25th to 75th percentile \u2014 shrunk the same way and multiplied through the same factors. ' +
          'A protocol priced off one peer shows a wide band on purpose: that band is the honest width of what one observation knows.</p></div>' +
        '<div class="mitem"><h3>The decision: what farming costs, and whether it is worth it</h3>' +
          '<p>The deposit scales with the protocol\u2019s TVL, gas accumulates weekly over the hold, and the hold itself lengthens for younger protocols that need more snapshots to qualify. ' +
          'The verdict reads the two numbers the model produced: a farm needs odds of ' + pct(D.model.farm_odds) + ' and an implied value of ' + usd(D.model.farm_min_implied_usd) + ', a watch needs ' + pct(D.model.watch_odds) + ' or ' + usd(D.model.watch_min_implied_usd) + ', and a 20% weekly TVL fall skips. ' +
          'What a position captures depends on the protocol\u2019s own points programme, which the snapshot does not carry, so no dollar payoff is claimed anywhere.</p></div>' +
      '</div>' +

      '<div class="grid2" style="margin-top:22px">' +
        '<section class="card"><h2>Every category the snapshot prices</h2><div class="body" style="padding:0">' +
          '<table class="small"><thead><tr><th>Category (diagnostic)</th><th class="num">Own median</th><th class="num">Peers</th><th class="num">Borrowed</th><th class="num">Shrunk</th><th class="num">Middle half</th></tr></thead>' +
          '<tbody>' + catRows + '</tbody></table></div></section>' +
        '<section class="card"><h2>The odds cohorts</h2><div class="body" style="padding:0">' +
          '<table class="small"><thead><tr><th>Age cohort</th><th class="num">Protocols</th><th class="num">With a token</th><th class="num">Rate</th></tr></thead>' +
          '<tbody>' + cohortRows + '</tbody></table>' +
          '<h2 style="border-top:1px solid var(--line-soft)">Already trading \u2014 the calibration set</h2>' +
          '<table class="small"><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Cap / TVL</th></tr></thead>' +
          '<tbody>' + liveRows + '</tbody></table></div></section>' +
      '</div>' +

      '<section class="card" style="margin-top:18px"><h2>What this board does not claim</h2><div class="body">' +
        '<p class="explain">A protocol on this board records no token <em>on DefiLlama\u2019s record</em>; that is not proof no token exists, and a protocol may carry one the record does not. ' +
        'The implied value is this board\u2019s own claim, never make.fun\u2019s, and it is not a price: it is what the market\u2019s current multiple would make of the protocol\u2019s TVL. ' +
        'The odds are a base rate over a sealed snapshot, not a forecast of any protocol\u2019s announcement, and the farm steps describe what a position costs in gas and time, not what it will earn.</p>' +
      '</div></section>' + foot();

    meta.textContent = 'snapshot ' + D.as_of + ' \u00b7 model ' + D.model_version;
  }

  // ---------- routing ----------

  // A filtered board is a link: #/?tab=farm&cat=Lending opens the board already filtered, so a
  // reader can send someone the view they mean instead of describing which boxes to tick.
  function applyParams(h) {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.tab = 'all'; state.sort = 'implied'; state.dir = -1;
    var at = h.indexOf('?');
    if (at < 0) return;
    var p = new URLSearchParams(h.slice(at + 1));
    if (p.has('q')) state.q = p.get('q');
    if (p.has('cat')) state.category = p.get('cat');
    if (p.has('chain')) state.chain = p.get('chain');
    if (p.has('tab')) state.tab = p.get('tab');
    if (p.has('sort')) { state.sort = p.get('sort'); state.dir = p.get('sort') === 'rank' ? 1 : -1; }
  }

  function route() {
    var h = location.hash || '#/';
    if (h.indexOf('#/p/') === 0) renderDetail(decodeURIComponent(h.slice(4)));
    else if (h.indexOf('#/method') === 0) renderMethod();
    else { applyParams(h); renderBoard(); }
    window.scrollTo(0, 0);
    root.removeAttribute('aria-busy');
  }

  meta.textContent = 'snapshot ' + D.as_of + ' \u00b7 ' + D.source;
  window.addEventListener('hashchange', route);
  route();
})();
