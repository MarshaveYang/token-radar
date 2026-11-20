// Token Radar's dashboard. Reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the board, the category multiples it is priced from, a filterable table, and a per-protocol
// detail view with the model's own inputs and the protocol's farm plan.
//
// No network: every byte shown is in data.js, and the page recomputes each row's implied value
// from the snapshot figures so what it shows and what board.json carries are visibly the same
// arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;

  var root = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  /* ---------- formatting ---------- */

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function age(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(d)) + 'd';
  }
  function multiple(n) { return (n === null || n === undefined ? 0 : n).toFixed(2) + 'x'; }

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries.
  function impliedOf(row, m) {
    var g = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (g / 100) * m.growth_weight;
    var a = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(a, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var scale = 1 / (1 + m.scale_damping * Math.max(0, Math.log(Math.max(row.tvl_usd, 1) / m.scale_ref_usd) / Math.LN10));
    var chains = 1 + m.chain_premium * Math.min(Math.max((row.chains || []).length - 1, 0), m.chain_cap);
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * growthMult * maturity * scale * chains));
  }

  /* ---------- dom ---------- */

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) {
        child.forEach(function (c) { if (c) node.appendChild(c); });
      } else if (typeof child === 'string' || typeof child === 'number') {
        node.appendChild(document.createTextNode(String(child)));
      } else {
        node.appendChild(child);
      }
    }
    return node;
  }

  /* ---------- routing ---------- */

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var p = new URLSearchParams(h);
    if (p.get('q')) state.q = p.get('q');
    if (p.get('p')) state.selected = p.get('p');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('tab')) state.tab = p.get('tab');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.tab !== 'pre-token') p.set('tab', state.tab);
    if (state.selected) p.set('p', state.selected);
    var next = p.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }

  /* ---------- filtering ---------- */

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function sorted(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null || a.change_7d === undefined ? -1e9 : a.change_7d; bv = b.change_7d === null || b.change_7d === undefined ? -1e9 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null || a.age_days === undefined ? 1e9 : a.age_days; bv = b.age_days === null || b.age_days === undefined ? 1e9 : b.age_days; }
      else if (key === 'multiple') { av = a.multiple; bv = b.multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  /* ---------- sections ---------- */

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark' }),
        el('span', { class: 'brand-name', text: 'Token Radar' })
      ),
      el('div', { class: 'top-meta' },
        el('span', { text: 'snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: 'model ' + DATA.model_version })
      )
    );
  }

  function hero() {
    return el('section', { class: 'hero' },
      el('div', null,
        el('h1', { html: 'Every protocol with <em>no token yet</em>, priced against its own market' }),
        el('p', { html: 'The snapshot already holds <b>' + DATA.live.length + '</b> trading protocols, so the market has already told us what it pays per dollar of TVL in each category. This board reads that ratio, applies it to the <b>' + DATA.board_size + '</b> protocols that have no token, and adds the steps to farm each one.' })
      ),
      el('div', { class: 'kpis' },
        el('div', { class: 'kpi hi' }, el('span', { text: 'Watchlist covered' }), el('b', null, String(DATA.watchlist_size), el('i', { text: '/' + DATA.watchlist_size }))),
        el('div', { class: 'kpi' }, el('span', { text: 'Rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'kpi' }, el('span', { text: 'Categories priced' }), el('b', null, String(DATA.category_count), el('i', { text: '/' + DATA.multiples.length }))),
        el('div', { class: 'kpi' }, el('span', { text: 'Market multiple' }), el('b', { text: multiple(DATA.market_median_multiple) }))
      )
    );
  }

  function multiplesStrip() {
    var top = DATA.multiples.filter(function (m) { return !m.fallback; });
    var rest = DATA.multiples.filter(function (m) { return m.fallback; });
    var shown = top.slice(0, 16);
    var max = shown.length ? shown[0].multiple : 1;
    var bars = shown.map(function (m) {
      return el('div', { class: 'mbar', title: m.category + ': median market cap / TVL across ' + m.samples + ' trading protocol(s)' },
        el('span', { class: 'mname', text: m.category }),
        el('span', { class: 'mval', text: multiple(m.multiple) }),
        el('span', { class: 'mtrack' }, el('i', { class: 'mfill', style: 'width:' + Math.max(4, Math.round((m.multiple / max) * 100)) + '%' }))
      );
    });
    return el('section', { class: 'multiples' },
      el('header', null,
        el('h2', { text: 'What the market pays per dollar of TVL, by category' }),
        el('p', { text: top.length + ' categories have at least ' + DATA.model.min_samples + ' trading protocols to read a median from. ' + rest.length + ' do not, and take the market median of ' + multiple(DATA.market_median_multiple) + ' instead of a number invented from one pair.' })
      ),
      el('div', { class: 'mbar-grid' }, bars)
    );
  }

  function controls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();

    var search = el('input', { type: 'search', id: 'q', placeholder: 'name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });

    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      cats.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });

    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });

    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token (' + DATA.rows.length + ')', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Already trading (' + DATA.live.length + ')', onclick: function () { state.tab = 'live'; writeHash(); render(); } });

    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('span', { class: 'sub-label', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? filtered().length + ' of ' + DATA.rows.length + ' rows' : DATA.live.length + ' trading protocols' })
    );
  }

  function sortTh(key, label, align) {
    return el('th', { scope: 'col', class: align === 'left' ? 'left' : null },
      el('button', { type: 'button', onclick: function () {
        if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; }
        render();
      } }, label, state.sort === key ? (state.dir < 0 ? ' \u2193' : ' \u2191') : '')
    );
  }

  function boardTable() {
    var list = sorted(filtered());
    if (!list.length) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'Nothing matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () {
          state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render();
        } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var body = el('tbody');
    list.forEach(function (r) {
      var g = r.change_7d;
      var gClass = g === null || g === undefined ? '' : g >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', null, el('span', { class: 'rank', text: '#' + r.rank })),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.chains && r.chains.length ? r.chains.slice(0, 2).join(' · ') : 'chain not listed') + (r.chains && r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') })
        )),
        el('td', { class: 'num', text: r.category || 'Other' }),
        el('td', { class: 'num', text: usd(r.tvl_usd) }),
        el('td', { class: 'num ' + gClass, text: pct(g) }),
        el('td', { class: 'num', text: age(r.age_days) }),
        el('td', { class: 'num', text: multiple(r.multiple) + (r.category_fallback ? '*' : '') }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: usd(r.implied_value_usd) })
        ))
      );
      body.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols ranked by implied value. A * marks a category with too few trading protocols to price on its own: it uses the market median of ' + multiple(DATA.market_median_multiple) + '. Select a row for the model behind it and its farm plan.' }),
          el('thead', null, el('tr', null,
            sortTh('implied', 'Rank', 'left'),
            sortTh('name', 'Protocol', 'left'),
            el('th', { scope: 'col' }, el('button', { type: 'button', onclick: function () { render(); }, text: 'Category' })),
            sortTh('tvl', 'TVL'),
            sortTh('growth', '7d'),
            sortTh('age', 'Age'),
            sortTh('multiple', 'Multiple'),
            sortTh('implied', 'Implied value')
          )),
          body
        )
      )
    );
  }

  function liveTable() {
    var body = el('tbody');
    var max = DATA.live.length ? (DATA.live[0].mcap_usd || 1) : 1;
    DATA.live.forEach(function (r) {
      body.appendChild(el('tr', { tabindex: '0' },
        el('td', null, el('span', { class: 'rank', text: '—' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.chains || []).slice(0, 2).join(' · ') || 'chain not listed' }))),
        el('td', { class: 'num', text: r.category || 'Other' }),
        el('td', { class: 'num', text: usd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: pct(r.change_7d) }),
        el('td', { class: 'num', text: multiple(r.ratio) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round(((r.mcap_usd || 0) / max) * 100)) + '%' })),
          el('span', { class: 'num', text: usd(r.mcap_usd) })
        ))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'These protocols already trade, so their market cap is a fact and their market-cap-to-TVL ratio is what the board reads. They are never mixed into the pre-token ranking.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', class: 'left' }, el('span', { text: 'Status' })),
            el('th', { scope: 'col', class: 'left' }, el('span', { text: 'Protocol' })),
            el('th', { scope: 'col' }, el('span', { text: 'Category' })),
            el('th', { scope: 'col' }, el('span', { text: 'TVL' })),
            el('th', { scope: 'col' }, el('span', { text: '7d' })),
            el('th', { scope: 'col' }, el('span', { text: 'MC / TVL' })),
            el('th', { scope: 'col' }, el('span', { text: 'Market cap' }))
          )),
          body
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { text: 'One function scores every row. It reads five inputs, all of them from the snapshot; no protocol name is special-cased and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'multiple(cat) = median( mcap_usd / tvl_usd ) over trading protocols in cat, n >= ' + m.min_samples + '\n' +
        'implied       = tvl_usd x multiple x growthMult x maturityMult x scaleMult x chainMult\n' +
        '  growthMult   = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + '\n' +
        '  maturityMult = ' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + '\n' +
        '  scaleMult    = 1 / (1 + ' + m.scale_damping + ' x max(0, log10(tvl_usd / ' + usd(m.scale_ref_usd) + ')))\n' +
        '  chainMult    = 1 + ' + m.chain_premium + ' x min(chains - 1, ' + m.chain_cap + ')'
      ),
      el('div', { class: 'factors' },
        el('div', { class: 'factor' },
          el('b', { text: 'Category multiple' }),
          el('span', { text: 'The market\u2019s own price per dollar of TVL in that category, read from the protocols that already trade. A DEX and a lending book do not clear at the same ratio, and this is where that shows up.' })
        ),
        el('div', { class: 'factor' },
          el('b', { text: 'Seven-day growth' }),
          el('span', { text: 'A protocol adding TVL is being adopted. Weighted lightly, because a seven-day window is noisy and a spike is not a trend.' })
        ),
        el('div', { class: 'factor' },
          el('b', { text: 'Maturity' }),
          el('span', { text: 'How long it has run with no token, from the day DefiLlama began tracking it. A protocol listed years ago is further into a launch cycle than one listed last month.' })
        ),
        el('div', { class: 'factor' },
          el('b', { text: 'Scale damping' }),
          el('span', { text: 'The larger the TVL, the lower the multiple it sustains. A $3B book does not double again; this keeps the top of the board honest.' })
        ),
        el('div', { class: 'factor' },
          el('b', { text: 'Chain reach' }),
          el('span', { text: 'A protocol live on many chains reaches more users per dollar of TVL, so it carries a small premium for that reach.' })
        ),
        el('div', { class: 'factor' },
          el('b', { text: 'Sample hygiene' }),
          el('span', { text: 'Per-pool entries (Aave V2, Osmosis DEX) are excluded: their TVL covers one pool while their market cap covers the whole protocol, which reads 19x where the protocol is 0.2x.' })
        )
      ),
      el('p', { class: 'note', text: 'Implied value is an estimate, not a price, and not a prediction that any of these protocols will issue a token. It answers one question: if this protocol\u2019s record stayed as it is, what would a token on it be worth at the multiple its own market already pays.' })
    );
  }

  /* ---------- detail ---------- */

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) row = DATA.rows[i];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';

    var recomputed = impliedOf(row, DATA.model);
    var agrees = recomputed === row.implied_value_usd;

    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'kicker', text: 'RANK ' + row.rank + ' OF ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { text: (row.category || 'Other') + ' · ' + ((row.chains || []).join(', ') || 'chain not listed') })
      ),
      el('button', { class: 'close', type: 'button', text: 'Close', onclick: function () { dialog.close(); } })
    ));

    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'How the number is built' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { text: usd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { text: multiple(row.multiple) + (row.category_fallback ? '*' : '') })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { text: pct(row.change_7d) })),
        el('div', null, el('span', { text: 'Maturity' }), el('b', { text: age(row.age_days) })),
        el('div', null, el('span', { text: 'Growth ×' }), el('b', { text: row.growth_multiplier.toFixed(3) })),
        el('div', null, el('span', { text: 'Maturity ×' }), el('b', { text: row.maturity_multiplier.toFixed(3) })),
        el('div', null, el('span', { text: 'Scale ×' }), el('b', { text: row.scale_multiplier.toFixed(3) })),
        el('div', null, el('span', { text: 'Chain ×' }), el('b', { text: row.chain_multiplier.toFixed(3) })),
        el('div', { class: 'result' }, el('span', { text: 'Implied value' }), el('b', { text: usd(row.implied_value_usd) }))
      ),
      el('p', { class: 'note', text: 'The multiple comes from the ' + (row.category_samples || 0) + ' trading ' + (row.category || 'category') + ' protocol(s) in the snapshot' + (row.category_fallback ? ', fewer than the ' + DATA.model.min_samples + ' this model wants, so it takes the market median' : ', taking their median market cap per dollar of TVL') + '. The page recomputes this row as ' + usd(recomputed) + (agrees ? ' — the same number board.json carries.' : ', which differs from the board: the data would be stale.') })
    ));

    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Chains' }),
      el('div', { class: 'chain-list' }, (row.chains || []).length
        ? row.chains.map(function (c) { return el('span', { class: 'pill', text: c }); })
        : [el('span', { class: 'pill', text: 'not listed' })])
    ));

    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, (row.farm_steps || []).map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));

    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  /* ---------- render ---------- */

  function render() {
    root.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(hero());
    shell.appendChild(multiplesStrip());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    root.appendChild(shell);
    root.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) document.body.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
