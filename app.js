/* Family Recipe Book: UI (Desi design v1) */
(function () {
  'use strict';
  var P = window.RecipeParser, S = window.Store;
  var CATS = P.CATEGORIES;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var app = $('#app');
  var view = { q: '', cat: 'All', fav: false, sort: 'new' };
  try { Object.assign(view, JSON.parse(sessionStorage.getItem('frb.view')) || {}); view.q = ''; } catch (e) {}
  if (view.cat !== 'All' && CATS.indexOf(view.cat) < 0) view.cat = 'All';
  var importDraft = null;
  var currentRoute = '';
  var popFor = null;          // { key, value } to animate stars after a rating change
  var detailState = {};       // per-recipe { servings, done: {} } while viewing

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function saveView() { sessionStorage.setItem('frb.view', JSON.stringify(view)); }
  function haptic() { if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {} }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function isGroup(x) { return x.indexOf('## ') === 0; }
  function realCount(a) { return a.filter(function (x) { return !isGroup(x); }).length; }

  var STAR_PATH = 'M12 2.6l2.83 5.9 6.47.82-4.75 4.47 1.2 6.42L12 17.1l-5.75 3.11 1.2-6.42L2.7 9.32l6.47-.82z';
  var STAR_SVG = '<svg class="e" viewBox="0 0 24 24"><path d="' + STAR_PATH + '"/></svg><svg class="f" viewBox="0 0 24 24"><path d="' + STAR_PATH + '"/></svg>';
  var CHECK = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FBF7F0" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>';
  var I = {
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9A8877" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
    sort: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9A8877" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
    plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFF6EE" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B0503A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14.5 5-7 7 7 7"/></svg>',
    edit: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/></svg>',
    share: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
    heart: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.3-9-8.7C1.7 8 3.6 5 6.7 5c2 0 3.4 1.1 4.3 2.6C11.9 6.1 13.3 5 15.3 5c3.1 0 5 3 3.7 6.3C17 15.7 12 20 12 20z" fill="var(--hf,none)" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    timer: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6A6B3C" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M10 2h4"/></svg>',
    okdot: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6A6B3C" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
    chev: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#B0503A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>'
  };

  // ---------- stars ----------
  // opts: { size, gap, input: true, key: 'recipe:<id>' | 'draft:<i>' }
  function starsHTML(value, opts) {
    opts = opts || {};
    var v = Math.round((Number(value) || 0) * 2) / 2;
    var cls = 'stars' + (v ? '' : ' unrated') + (opts.input ? ' rateable' : '');
    var style = '--sz:' + (opts.size || 13) + 'px;--gap:' + (opts.gap == null ? 2 : opts.gap) + 'px';
    var a = opts.input
      ? ' role="slider" tabindex="0" aria-label="Rating" aria-valuemin="0" aria-valuemax="5" aria-valuenow="' + v + '" aria-valuetext="' + (v ? v + ' out of 5 stars' : 'Not yet rated') + '" data-key="' + esc(opts.key) + '"'
      : ' role="img" aria-label="' + (v ? v + ' out of 5 stars' : 'Not yet rated') + '"';
    var doPop = opts.input && popFor && popFor.key === opts.key;
    var h = '<span class="' + cls + '" style="' + style + '"' + a + '>';
    for (var i = 1; i <= 5; i++) {
      var c = v >= i ? 'full' : v >= i - 0.5 ? 'half' : 'none';
      var pop = doPop && c !== 'none' ? ' pop" style="animation-delay:' + ((i - 1) * 30) + 'ms' : '';
      h += '<span class="star ' + c + pop + '" data-n="' + i + '">' + STAR_SVG + '</span>';
    }
    return h + '</span>';
  }
  function getRating(key) {
    var p = key.split(':');
    if (p[0] === 'recipe') { var r = S.get(p[1]); return r ? r.rating : 0; }
    return importDraft && importDraft.items[+p[1]] ? importDraft.items[+p[1]].rating || 0 : 0;
  }
  function setRating(key, v, quiet) {
    var p = key.split(':');
    popFor = v > 0 ? { key: key, value: v } : null;
    if (p[0] === 'recipe') S.update(p[1], { rating: v });
    else if (importDraft) { importDraft.items[+p[1]].rating = v; renderFound(); }
    if (!quiet) haptic();
    setTimeout(function () { popFor = null; }, 400);
  }
  // Rules (Desi 03): tap n → n; tap the selected star again → toggles n ↔ n−0.5; long-press 500ms → clear with Undo.
  function nextRating(cur, n) {
    if (cur === n) return n - 0.5;
    if (cur === n - 0.5) return n;
    return n;
  }
  function starFromPoint(el, x) {
    var stars = $$('.star', el), best = null, bd = Infinity;
    stars.forEach(function (s) { var b = s.getBoundingClientRect(), d = Math.abs(x - (b.left + b.width / 2)); if (d < bd) { bd = d; best = s; } });
    return best;
  }
  var press = null;
  document.addEventListener('pointerdown', function (e) {
    var el = e.target.closest('.stars.rateable'); if (!el) return;
    var star = starFromPoint(el, e.clientX); if (!star) return;
    star.classList.add('press');
    var key = el.dataset.key;
    press = { el: el, star: star, key: key, n: +star.dataset.n, long: false, x: e.clientX, y: e.clientY };
    press.timer = setTimeout(function () {
      if (!press) return;
      press.long = true;
      var prev = getRating(key);
      star.classList.remove('press');
      if (prev) {
        setRating(key, 0);
        toast('Rating cleared', function () { setRating(key, prev, true); });
      }
    }, 500);
  });
  function endPress(e, cancel) {
    if (!press) return;
    clearTimeout(press.timer);
    press.star.classList.remove('press');
    var p = press; press = null;
    if (cancel || p.long) return;
    if (e && (Math.abs(e.clientX - p.x) > 12 || Math.abs(e.clientY - p.y) > 12)) return; // was a scroll
    setRating(p.key, nextRating(getRating(p.key), p.n));
  }
  document.addEventListener('pointerup', function (e) { endPress(e); });
  document.addEventListener('pointercancel', function () { endPress(null, true); });
  document.addEventListener('contextmenu', function (e) { if (e.target.closest('.stars.rateable')) e.preventDefault(); });
  document.addEventListener('keydown', function (e) {
    var el = e.target.closest && e.target.closest('.stars.rateable'); if (!el) return;
    var cur = getRating(el.dataset.key), v = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = Math.min(5, cur + 0.5);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = Math.max(0, cur - 0.5);
    else if (e.key === 'Home') v = 0; else if (e.key === 'End') v = 5;
    if (v == null) return;
    e.preventDefault(); setRating(el.dataset.key, v);
    var again = $('.stars.rateable[data-key="' + el.dataset.key + '"]'); if (again) again.focus();
  });

  // ---------- toast / confirm ----------
  var toastTimer;
  function toast(msg, undoFn) {
    var t = $('#toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (undoFn ? '<button id="undoBtn">Undo</button>' : '');
    t.hidden = false;
    if (undoFn) $('#undoBtn').onclick = function () { undoFn(); t.hidden = true; };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, undoFn ? 7000 : 2600);
  }
  function confirmDialog(title, text, okLabel) {
    var d = $('#confirmDlg');
    $('#confirmTitle').textContent = title; $('#confirmText').textContent = text; $('#confirmOk').textContent = okLabel || 'Delete';
    return new Promise(function (res) { d.returnValue = ''; d.onclose = function () { res(d.returnValue === 'ok'); }; d.showModal(); });
  }
  function deleteRecipe(id) {
    var r = S.get(id); if (!r) return;
    confirmDialog('Delete “' + r.title + '”?', 'It will be removed from the recipe book. You can undo right after.').then(function (ok) {
      if (!ok) return;
      var removed = S.remove(id);
      if (location.hash.indexOf(id) >= 0) location.hash = '#/';
      setTimeout(function () { toast('Recipe deleted', function () { S.restore(removed); toast('Recipe restored'); }); }, 0);
    });
  }

  // ---------- helpers ----------
  function catOptions(sel) { return CATS.map(function (c) { return '<option' + (c === sel ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join(''); }
  function totalLabel(r) {
    var m = P.parseMinutes(r.totalTime) || (P.parseMinutes(r.prepTime) + P.parseMinutes(r.cookTime)) || P.parseMinutes(r.time);
    if (m) return P.formatMinutes(m);
    return r.totalTime || r.time || '';
  }
  function servesNum(r) { var m = String(r.servings || '').match(/\d+/); return m ? +m[0] : 0; }
  function isToday(iso) { var d = new Date(iso), n = new Date(); return d.toDateString() === n.toDateString(); }
  function recipeNo(r) {
    var sorted = S.all().sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
    return sorted.findIndex(function (x) { return x.id === r.id; }) + 1;
  }
  function titleHTML(t) {
    var w = String(t).trim().split(/\s+/);
    if (w.length < 2) return esc(t);
    var k = w.length >= 4 ? 2 : 1;
    return esc(w.slice(0, -k).join(' ')) + ' <em>' + esc(w.slice(-k).join(' ')) + '</em>';
  }
  function fmtDate(iso) { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }); }

  // ---------- quantities ----------
  var FR = { '½': .5, '¼': .25, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': .125, '⅜': .375, '⅝': .625, '⅞': .875 };
  var UNITS = '(?:cups?|c\\.|tablespoons?|tbsps?|tbs|T|teaspoons?|tsps?|t|pounds?|lbs?|ounces?|oz|grams?|g|kilograms?|kg|ml|milliliters?|l|liters?|litres?|quarts?|qts?|pints?|pts?|gallons?|cloves?|cans?|jars?|packages?|pkgs?|sticks?|slices?|pinch(?:es)?|dash(?:es)?|handfuls?|bunch(?:es)?|sprigs?|heads?|large|medium|small|whole|stalks?|fillets?|pieces?|inch(?:es)?|in\\.?)';
  var QTY_RE = new RegExp('^((?:\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+(?:\\.\\d+)?\\s*[½¼¾⅓⅔⅛⅜⅝⅞]?|[½¼¾⅓⅔⅛⅜⅝⅞])(?:\\s*(?:-|–|to)\\s*(?:\\d+(?:\\.\\d+)?|\\d+/\\d+))?)\\s*(' + UNITS + '\\b\\.?)?\\s*(.*)$', 'i');
  function toNum(s) {
    s = s.trim(); var n = 0;
    s.replace(/[½¼¾⅓⅔⅛⅜⅝⅞]/g, function (c) { n += FR[c]; return ''; });
    var rest = s.replace(/[½¼¾⅓⅔⅛⅜⅝⅞]/g, '').trim();
    if (/^\d+\s+\d+\/\d+$/.test(rest)) { var a = rest.split(/\s+/); var f = a[1].split('/'); return n + (+a[0]) + f[0] / f[1]; }
    if (/^\d+\/\d+$/.test(rest)) { var g = rest.split('/'); return n + g[0] / g[1]; }
    return n + (parseFloat(rest) || 0);
  }
  function fmtNum(x) {
    var whole = Math.floor(x + 1e-9), frac = x - whole, best = '', bd = 0.06;
    [[0, ''], [.125, '⅛'], [.25, '¼'], [1 / 3, '⅓'], [.5, '½'], [2 / 3, '⅔'], [.75, '¾'], [1, '']].forEach(function (p) {
      var d = Math.abs(frac - p[0]); if (d < bd) { bd = d; best = p[1]; if (p[0] === 1) { whole += 1; } else if (p[0] === 0) best = ''; }
    });
    if (bd === 0.06) return (Math.round(x * 10) / 10).toString();
    return (whole ? whole : '') + best || '0';
  }
  function splitQty(line, factor) {
    var m = line.match(QTY_RE);
    if (!m || !m[3] && !m[2]) return { q: '', t: line };
    var q = m[1];
    {
      factor = factor || 1;
      q = q.replace(/(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?\s*[½¼¾⅓⅔⅛⅜⅝⅞]?|[½¼¾⅓⅔⅛⅜⅝⅞])/g, function (n) { return fmtNum(toNum(n) * factor); });
    }
    var unit = (m[2] || '').trim();
    var t = (m[3] || '').trim();
    var qcol = (q + (unit ? ' ' + unit : '')).trim();
    if (qcol.length > 9) { t = (unit ? unit + ' ' : '') + t; qcol = q; }
    return { q: qcol, t: t || line };
  }

  // ---------- 01 home ----------
  function filtered() {
    var q = view.q.trim().toLowerCase();
    var list = S.all().filter(function (r) {
      if (view.cat !== 'All' && r.category !== view.cat) return false;
      if (view.fav && !r.favorite) return false;
      if (!q) return true;
      return (r.title + ' ' + r.ingredients.join(' ')).toLowerCase().indexOf(q) >= 0;
    });
    var by = {
      top: function (a, b) { return b.rating - a.rating || a.title.localeCompare(b.title); },
      new: function (a, b) { return b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0; },
      az: function (a, b) { return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }); }
    };
    return list.sort(by[view.sort] || by.new);
  }
  function catCounts() {
    var counts = {};
    S.all().forEach(function (r) { counts[r.category] = (counts[r.category] || 0) + 1; });
    return CATS.filter(function (c) { return counts[c]; }).sort(function (a, b) { return counts[b] - counts[a] || CATS.indexOf(a) - CATS.indexOf(b); }).map(function (c) { return [c, counts[c]]; });
  }
  function renderList() {
    var s = S.sync;
    var sortLbl = { top: 'Rating', az: 'A–Z', new: 'Recent' }[view.sort];
    app.innerHTML =
      '<header class="home-head"><div>' +
        '<div class="kicker">The Forsyth Kitchen</div>' +
        '<h1>Family <em>Recipe</em> Book</h1>' +
        '<div class="sub" id="countLine"></div></div>' +
        '<button class="avatar" id="syncBtn" aria-label="Family sharing and account">F<span class="dot" id="syncDot"></span></button>' +
      '</header>' +
      '<label class="search">' + I.search + '<input id="q" type="search" placeholder="Search recipes or ingredients" aria-label="Search recipes or ingredients" value="' + esc(view.q) + '" autocomplete="off" enterkeyhint="search">' +
        '<span class="sortk">' + I.sort + '<b id="sortLbl">' + sortLbl + '</b><select id="sort" aria-label="Sort recipes"><option value="top"' + (view.sort === 'top' ? ' selected' : '') + '>Rating</option><option value="az"' + (view.sort === 'az' ? ' selected' : '') + '>A–Z</option><option value="new"' + (view.sort === 'new' ? ' selected' : '') + '>Recently added</option></select></span></label>' +
      '<div class="chips" id="chips" role="toolbar" aria-label="Filter by category"></div>' +
      (!s.configured ? '<div class="local-note" id="localNote"><span class="tag">On this device</span>Family sharing can be turned on later.</div>' : '') +
      '<div id="grid"></div>' +
      '<div class="fade"></div><a class="fab" href="#/import"><span class="ic">' + I.plus + '</span>Paste a recipe</a>';
    $('#q').addEventListener('input', function (e) { view.q = e.target.value; renderGrid(); });
    $('#sort').addEventListener('change', function (e) { view.sort = e.target.value; $('#sortLbl').textContent = { top: 'Rating', az: 'A–Z', new: 'Recent' }[view.sort]; saveView(); renderGrid(); });
    $('#syncBtn').onclick = openSync;
    updateDot();
    renderGrid();
  }
  function rowHTML(r) {
    var meta = [];
    if (!r.rating && isToday(r.createdAt)) meta = ['<span class="new">New</span>', 'Added today', 'Not yet rated'];
    else {
      var t = totalLabel(r); if (t) meta.push(esc(t));
      var n = servesNum(r); if (n) meta.push('Serves ' + n);
      if (!meta.length) meta.push(plural(realCount(r.ingredients), 'ingredient'));
      if (r.favorite) meta.push('<span class="fav">♥ Favorite</span>');
    }
    return '<a class="rrow" href="#/r/' + r.id + '" data-cat="' + esc(r.category) + '">' +
      '<span class="tile" aria-hidden="true">' + esc((r.title.match(/[A-Za-z0-9]/) || ['·'])[0].toUpperCase()) + '</span>' +
      '<span class="rbody"><span class="name-line"><span class="name">' + esc(r.title) + '</span>' + starsHTML(r.rating, { size: 13, gap: 2 }) + '</span>' +
      '<span class="meta">' + meta.join('<i></i>') + '</span></span></a>';
  }
  function renderGrid() {
    var grid = $('#grid'); if (!grid) return;
    var all = S.all(), cc = catCounts();
    $('#countLine').textContent = all.length ? plural(all.length, 'recipe') + ', lovingly kept' : 'Ready for your first recipe';
    var favN = all.filter(function (r) { return r.favorite; }).length;
    $('#chips').innerHTML = '<button class="chip" data-chip="All" aria-pressed="' + (view.cat === 'All' && !view.fav) + '">All <b>' + all.length + '</b></button>' +
      cc.map(function (c) { return '<button class="chip" data-chip="' + esc(c[0]) + '" aria-pressed="' + (view.cat === c[0]) + '">' + esc(c[0]) + ' <b>' + c[1] + '</b></button>'; }).join('') +
      (favN || view.fav ? '<button class="chip fav" data-chip="fav" aria-pressed="' + view.fav + '">♥ Favorites <b>' + favN + '</b></button>' : '');
    if (!all.length) {
      grid.innerHTML = '<div class="empty"><span class="orn">✦ ✦ ✦</span><h2>Your recipe book is <em>ready</em></h2>' +
        '<p>Copy a recipe from ChatGPT, then tap <b>Paste a recipe</b>.</p><p>One recipe or a dozen at once — we’ll tidy them up and sort them for you.</p>' +
        '<div class="links"><a class="btn ghost" href="#/new">Type one in instead</a></div></div>';
      return;
    }
    var list = filtered();
    if (!list.length) {
      grid.innerHTML = '<div class="empty"><h2>Nothing <em>matches</em></h2><p>Try a different word or category.</p><div class="links"><button class="btn ghost" data-act="clear">Show all recipes</button></div></div>';
      return;
    }
    var groups = [];
    if (view.q.trim() || view.fav) groups = [[view.q.trim() ? 'Results' : 'Favorites', list]];
    else {
      var order = view.cat === 'All' ? cc.map(function (c) { return c[0]; }) : [view.cat];
      groups = order.map(function (c) { return [c, list.filter(function (r) { return r.category === c; })]; }).filter(function (g) { return g[1].length; });
    }
    grid.innerHTML = groups.map(function (g) {
      var showAll = view.cat === 'All' && !view.q.trim() && !view.fav && cc.length > 1;
      return '<section class="sec"><div class="sec-h"><h2>' + esc(g[0]) + '</h2><span class="n">' + g[1].length + '</span><span class="rule"></span>' +
        (showAll ? '<button class="all" data-chip="' + esc(g[0]) + '">See all</button>' : '') + '</div>' +
        '<div class="card">' + g[1].map(rowHTML).join('') + '</div></section>';
    }).join('');
  }

  // ---------- 02 detail ----------
  function timeCell(label, val) {
    var m = P.parseMinutes(val), h;
    if (m) { var hh = Math.floor(m / 60), mm = m % 60; h = hh ? hh + '<small>h</small>' + (mm ? ' ' + mm + '<small>m</small>' : '') : mm + '<small>min</small>'; if (hh && mm) label += '" data-long="1'; }
    else h = val ? esc(val) : '—';
    var long = /data-long/.test(label); label = label.split('"')[0];
    return '<div class="cell"><div class="kicker">' + label + '</div><div class="v' + (val ? '' : ' missing') + (long ? ' sm' : '') + '">' + h + '</div></div>';
  }
  function renderDetail(id) {
    var r = S.get(id);
    if (!r) { app.innerHTML = '<div class="nav"><a class="back" href="#/">' + I.back + 'Recipes</a></div><div class="empty"><h2>Recipe not <em>found</em></h2></div>'; return; }
    var st = detailState[id] || (detailState[id] = { servings: servesNum(r), done: {} });
    var base = servesNum(r), factor = base && st.servings ? st.servings / base : 1;
    var nIng = realCount(r.ingredients), nDone = Object.keys(st.done).filter(function (k) { return st.done[k]; }).length;
    var stepNo = 0, ingIdx = -1;
    var total = r.totalTime || (P.parseMinutes(r.prepTime) + P.parseMinutes(r.cookTime) ? P.formatMinutes(P.parseMinutes(r.prepTime) + P.parseMinutes(r.cookTime)) : '') || r.time;
    app.innerHTML =
      '<div class="nav"><a class="back" href="#/">' + I.back + 'Recipes</a><span class="r">' +
        '<button class="btn-ic' + (r.favorite ? ' on' : '') + '" style="' + (r.favorite ? '--hf:currentColor' : '') + '" data-act="fav" data-id="' + r.id + '" aria-label="' + (r.favorite ? 'Remove from favorites' : 'Add to favorites') + '" aria-pressed="' + r.favorite + '">' + I.heart + '</button>' +
        '<a class="btn-ic" href="#/edit/' + r.id + '" aria-label="Edit recipe">' + I.edit + '</a>' +
        '<button class="btn-ic" data-act="share" data-id="' + r.id + '" aria-label="Share recipe">' + I.share + '</button></span></div>' +
      '<div class="hero" data-cat="' + esc(r.category) + '">' +
        '<div class="kick"><span class="dash"></span><span class="kicker">' + esc(r.category) + ' · No. ' + recipeNo(r) + '</span></div>' +
        '<h1>' + titleHTML(r.title) + '</h1>' +
        '<div class="rate">' + starsHTML(r.rating, { size: 20, gap: 3, input: true, key: 'recipe:' + r.id }) +
          '<span class="val">' + (r.rating ? r.rating : '') + '</span><span class="lbl">' + 'Tap to rate' + '</span></div>' +
        (r.description ? '<p class="lede">' + esc(r.description) + '</p>' : '') +
      '</div>' +
      '<div class="strip">' +
        '<div class="cell"><div class="kicker">Serves</div>' + (base
          ? '<div class="stepper"><button data-act="serv" data-d="-1" aria-label="Fewer servings">−</button><span class="v" aria-live="polite">' + st.servings + '</span><button data-act="serv" data-d="1" aria-label="More servings">+</button></div>'
          : '<div class="v missing">' + (r.servings ? esc(r.servings) : '—') + '</div>') + '</div>' +
        timeCell('Prep', r.prepTime) + timeCell('Cook', r.cookTime) + timeCell('Total', total) +
      '</div>' +
      '<nav class="seg" aria-label="Jump to"><button class="on" data-jump="ing">Ingredients</button><button data-jump="steps">Steps</button><button data-jump="notes">Notes</button></nav>' +
      '<section class="dsec" id="ing"><h2>Ingredients <span class="n">' + nIng + '</span><span class="rule"></span><span class="x">' + nDone + ' of ' + nIng + '</span></h2><ul class="ing">' +
        (r.ingredients.map(function (x) {
          if (isGroup(x)) return '<li class="group"><span class="kicker">' + esc(x.slice(3)) + '</span></li>';
          ingIdx++;
          var q = splitQty(x, factor);
          return '<li data-act="tick" data-i="' + ingIdx + '" class="' + (st.done[ingIdx] ? 'done' : '') + '" role="checkbox" aria-checked="' + !!st.done[ingIdx] + '"><span class="ck">' + CHECK + '</span><span class="q">' + esc(q.q) + '</span><span class="t">' + esc(q.t) + '</span></li>';
        }).join('') || '<li class="group"><span class="help">No ingredients yet — tap Edit to add them.</span></li>') + '</ul></section>' +
      '<section class="dsec" id="steps"><h2>Steps <span class="n">' + realCount(r.steps) + '</span><span class="rule"></span></h2><ol class="steps">' +
        (r.steps.map(function (x) {
          if (isGroup(x)) return '<li class="group"><span class="kicker">' + esc(x.slice(3)) + '</span></li>';
          stepNo++;
          var tm = x.match(/(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|h|minutes?|mins?)\b/i), pill = '';
          if (tm) {
            var amt = parseFloat(tm[2] || tm[1]), hrs = /^h/i.test(tm[3]), secs = Math.round(amt * (hrs ? 3600 : 60));
            if (secs > 0 && secs <= 24 * 3600) pill = '<button class="tm" data-act="timer" data-s="' + secs + '">' + I.timer + '<span>Start ' + (tm[2] || tm[1]) + ' ' + (hrs ? 'h' : 'min') + ' timer</span></button>';
          }
          return '<li><span class="no">' + stepNo + '</span><div><p>' + esc(x) + '</p>' + pill + '</div></li>';
        }).join('') || '<li class="group"><span class="help">No steps yet.</span></li>') + '</ol></section>' +
      '<section class="dsec" id="notes"><div class="knote' + (r.notes ? '' : ' empty-note') + '"><div class="kicker">Kitchen note</div><p>' + (r.notes ? esc(r.notes) : 'No notes yet. Tap Edit to jot one down.') + '</p></div></section>' +
      '<div class="foot"><span class="orn">✦ ✦ ✦</span>' + (r.source === 'paste' ? 'Pasted from ChatGPT' : 'Added by hand') + ' · Saved ' + fmtDate(r.createdAt) +
        '<br><button class="del" data-act="del" data-id="' + r.id + '">Delete recipe</button></div>';
    $$('.seg button').forEach(function (b) { b.onclick = function () { $('#' + b.dataset.jump).scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
    restoreTimers();
  }
  function onScrollSeg() {
    var segs = $$('.seg button'); if (!segs.length) return;
    var on = 'ing';
    ['ing', 'steps', 'notes'].forEach(function (id) { var el = $('#' + id); if (el && el.getBoundingClientRect().top < 180) on = id; });
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) on = 'notes';
    segs.forEach(function (b) { b.classList.toggle('on', b.dataset.jump === on); });
  }
  window.addEventListener('scroll', onScrollSeg, { passive: true });

  // simple step timers (survive re-renders while on the page)
  var timers = {};
  function fmtClock(s) { var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); }
  function restoreTimers() {
    $$('.tm').forEach(function (b, i) { var t = timers[currentRoute + i]; if (t) paintTimer(b, t); });
  }
  function paintTimer(b, t) {
    var left = Math.max(0, Math.round((t.end - Date.now()) / 1000));
    b.classList.add('run'); b.querySelector('span').textContent = left ? fmtClock(left) + ' · tap to stop' : 'Time’s up!';
  }
  setInterval(function () {
    $$('.tm').forEach(function (b, i) {
      var k = currentRoute + i, t = timers[k]; if (!t) return;
      paintTimer(b, t);
      if (!t.fired && Date.now() >= t.end) { t.fired = true; haptic(); toast('⏲ Timer done'); }
    });
  }, 1000);

  // ---------- 04 paste ----------
  function renderImport() {
    app.innerHTML =
      '<div class="bar"><a href="#/">Cancel</a><span class="t">New Recipe</span><a href="#/new" style="justify-content:flex-end">Type</a></div>' +
      '<div class="paste-intro"><h1>Paste it <em>in</em>,<br>we’ll tidy it up.</h1></div>' +
      '<div class="paste"><div class="hd"><span class="kicker">From ChatGPT</span><span class="kicker" id="pastedOk" style="color:var(--olive)" hidden>Pasted ✓</span></div>' +
        '<textarea id="paste" aria-label="Paste recipes here" placeholder="Paste one recipe, or several at once…"></textarea>' +
        '<div class="bigpaste" id="bigPaste"><button type="button" id="bigPasteBtn">' + I.plus + 'Paste</button></div>' +
        '<div class="ft"><button class="pill" id="pasteAgain" type="button">Paste again</button><button class="pill" id="clearPaste" type="button">Clear</button><span class="cnt" id="cnt">0 characters</span></div></div>' +
      '<div id="found"></div>';
    var ta = $('#paste');
    if (importDraft) ta.value = importDraft.text;
    var deb;
    ta.addEventListener('input', function () { clearTimeout(deb); deb = setTimeout(function () { parseNow(ta.value); }, 250); syncPasteChrome(); });
    $('#bigPasteBtn').onclick = $('#pasteAgain').onclick = readClipboard;
    $('#clearPaste').onclick = function () { ta.value = ''; importDraft = null; syncPasteChrome(); renderFound(); ta.focus(); };
    syncPasteChrome(); renderFound();
    // Desi: read the clipboard on open if permission is already granted; otherwise show the big Paste button.
    if (!ta.value && navigator.permissions && navigator.clipboard && navigator.clipboard.readText) {
      navigator.permissions.query({ name: 'clipboard-read' }).then(function (p) { if (p.state === 'granted') readClipboard(); }).catch(function () {});
    }
  }
  function syncPasteChrome() {
    var ta = $('#paste'); if (!ta) return;
    var n = ta.value.length;
    $('#cnt').textContent = n.toLocaleString() + ' characters';
    $('#pastedOk').hidden = !n; $('#bigPaste').hidden = !!n;
  }
  function readClipboard() {
    var ta = $('#paste');
    if (!navigator.clipboard || !navigator.clipboard.readText) { ta.focus(); toast('Press and hold in the box, then tap Paste'); return; }
    navigator.clipboard.readText().then(function (t) {
      if (!t) { toast('The clipboard is empty — copy a recipe first'); return; }
      ta.value = t; syncPasteChrome(); parseNow(t);
    }).catch(function () { ta.focus(); toast('Press and hold in the box, then tap Paste'); });
  }
  function parseNow(text) {
    var prev = importDraft && importDraft.items || [];
    var items = P.parseRecipes(text).map(function (r, i) { r.keep = true; r.rating = prev[i] && prev[i].title === r.title ? prev[i].rating : 0; return r; });
    importDraft = { text: text, items: items };
    renderFound();
  }
  function factHTML(i, label, val, field) {
    if (val) return '<span>' + I.okdot + ' <span>' + label.replace('%', '<b>' + esc(val) + '</b>') + '</span></span>';
    return '<span class="miss">' + label.replace('%', '—') + ' · <button data-add="' + field + '" data-i="' + i + '">Add</button></span>';
  }
  function renderFound() {
    var el = $('#found'); if (!el) return;
    var cta = $('.cta-wrap'); if (cta) cta.remove();
    if (!importDraft || !importDraft.text.trim()) { el.innerHTML = '<p class="tip">Tip: in ChatGPT, tap the copy icon under the answer, then come back here.</p>'; return; }
    var items = importDraft.items;
    if (!items.length) { el.innerHTML = '<div class="nomatch">We couldn’t spot a recipe yet. Make sure the text includes an ingredients list — or <a href="#/new">type it in</a>.</div>'; return; }
    var multi = items.length > 1, keep = items.filter(function (r) { return r.keep; }).length;
    el.innerHTML = (multi ? '<div class="found-h"><h2>We found</h2><span class="n">' + items.length + ' recipes</span><span class="rule"></span></div>' : '') +
      items.map(function (r, i) {
        var made = '<div class="made"><div class="q">Made it already?<span class="skip">Optional. You can rate it later.</span></div>' + starsHTML(r.rating, { size: 26, gap: 6, input: true, key: 'draft:' + i }) + '</div>';
        return '<div class="read' + (r.keep ? '' : ' off') + '" data-cat="' + esc(r.category) + '">' +
          '<div class="k2"><span class="dot">' + I.okdot + '</span><span class="kicker">' + (multi ? 'Recipe ' + (i + 1) + ' of ' + items.length : 'Here’s what we found') + '</span>' +
            (multi ? '<label class="keep"><input type="checkbox" data-i="' + i + '" data-f="keep"' + (r.keep ? ' checked' : '') + '> Save</label>' : '') + '</div>' +
          '<input class="title-in" data-i="' + i + '" data-f="title" value="' + esc(r.title) + '" aria-label="Recipe name">' +
          '<div class="sorted"><span class="tile">' + esc(r.category[0]) + '</span><div><div class="lb">Auto-sorted into</div><div class="v">' + esc(r.category) + '</div></div><span class="ch">Change ' + I.chev + '</span>' +
            '<select data-i="' + i + '" data-f="category" aria-label="Change category">' + catOptions(r.category) + '</select></div>' +
          '<div class="facts">' +
            factHTML(i, 'Serves %', String(r.servings || '').replace(/^serves\s*/i, ''), 'servings') +
            factHTML(i, '% total', r.totalTime || r.time, 'totalTime') +
            factHTML(i, '% ingredients', realCount(r.ingredients) || '', 'ingredients') +
            factHTML(i, '% steps', realCount(r.steps) || '', 'steps') +
          '</div>' + (multi ? made : '') + '</div>' + (multi ? '' : made);
      }).join('');
    var wrap = document.createElement('div'); wrap.className = 'cta-wrap';
    wrap.innerHTML = '<button class="cta" id="saveAll"' + (keep ? '' : ' disabled') + '>' + (multi ? 'Save ' + keep + ' to Recipe Book' : 'Save to Recipe Book') + '</button>';
    document.body.appendChild(wrap);
    $('#saveAll').onclick = saveDraft;
    el.oninput = el.onchange = function (e) {
      var t = e.target, i = t.dataset.i; if (i == null || !t.dataset.f) return;
      var r = importDraft.items[i];
      if (t.dataset.f === 'keep') { r.keep = t.checked; renderFound(); }
      else if (t.dataset.f === 'category') { r.category = t.value; renderFound(); }
      else if (t.dataset.f === 'fact') { r[t.dataset.field] = t.value; }
      else r[t.dataset.f] = t.value;
    };
  }
  function saveDraft() {
    var list = importDraft.items.filter(function (r) { return r.keep; }).map(function (r) { var c = Object.assign({}, r); delete c.keep; return c; });
    if (!list.length) return;
    var added = S.add(list); importDraft = null;
    view.cat = 'All'; view.fav = false; saveView();
    location.hash = list.length === 1 ? '#/r/' + added[0].id : '#/';
    toast('Saved ' + plural(list.length, 'recipe') + ' ✓');
  }

  // ---------- edit / new ----------
  function renderEdit(id) {
    var r = id ? S.get(id) : { title: '', category: 'Mains', ingredients: [], steps: [], servings: '', prepTime: '', cookTime: '', totalTime: '', description: '', notes: '' };
    if (!r) { location.hash = '#/'; return; }
    function lines(a) { return a.map(function (x) { return isGroup(x) ? x.slice(3) + ':' : x; }).join('\n'); }
    var backHref = id ? '#/r/' + id : '#/';
    app.innerHTML =
      '<div class="bar"><a href="' + backHref + '">Cancel</a><span class="t">' + (id ? 'Edit Recipe' : 'New Recipe') + '</span><button class="c" form="editForm" type="submit" style="justify-content:flex-end;color:var(--terracotta);font-weight:600">Save</button></div>' +
      '<form class="form" id="editForm">' +
        '<label class="field"><span class="kicker">Name</span><input class="input" name="title" required value="' + esc(r.title) + '"></label>' +
        '<div class="two"><label class="field"><span class="kicker">Category</span><select class="input" name="category">' + catOptions(r.category) + '</select></label>' +
        '<label class="field"><span class="kicker">Serves</span><input class="input" name="servings" inputmode="numeric" value="' + esc(r.servings) + '" placeholder="4"></label></div>' +
        '<div class="three"><label class="field"><span class="kicker">Prep</span><input class="input" name="prepTime" value="' + esc(r.prepTime) + '" placeholder="15 min"></label>' +
        '<label class="field"><span class="kicker">Cook</span><input class="input" name="cookTime" value="' + esc(r.cookTime) + '" placeholder="30 min"></label>' +
        '<label class="field"><span class="kicker">Total</span><input class="input" name="totalTime" value="' + esc(r.totalTime || (!r.prepTime && !r.cookTime ? r.time || '' : '')) + '" placeholder="45 min"></label></div>' +
        '<label class="field"><span class="kicker">One-line description <span class="help">(optional)</span></span><input class="input" name="description" value="' + esc(r.description) + '"></label>' +
        '<label class="field"><span class="kicker">Ingredients <span class="help">One per line. End a line with “:” for a heading.</span></span><textarea class="input" name="ingredients" rows="8">' + esc(lines(r.ingredients)) + '</textarea></label>' +
        '<label class="field"><span class="kicker">Steps <span class="help">One step per line.</span></span><textarea class="input" name="steps" rows="8">' + esc(lines(r.steps)) + '</textarea></label>' +
        '<label class="field"><span class="kicker">Kitchen note</span><textarea class="input" name="notes" rows="3" style="min-height:90px">' + esc(r.notes) + '</textarea></label>' +
        '<button class="btn block" type="submit">Save recipe</button>' +
      '</form>';
    $('#editForm').onsubmit = function (e) {
      e.preventDefault();
      var f = new FormData(e.target);
      function split(s) { return String(s).split('\n').map(function (x) { return x.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim(); }).filter(Boolean).map(function (x) { return /:$/.test(x) && x.length < 50 ? '## ' + x.slice(0, -1) : x; }); }
      var g = function (k) { return String(f.get(k) || '').trim(); };
      var data = { title: g('title') || 'Untitled recipe', category: g('category'), servings: g('servings'), prepTime: g('prepTime'), cookTime: g('cookTime'), totalTime: g('totalTime'),
        description: g('description'), ingredients: split(f.get('ingredients')), steps: split(f.get('steps')), notes: g('notes') };
      data.time = [data.prepTime && 'Prep: ' + data.prepTime, data.cookTime && 'Cook: ' + data.cookTime, data.totalTime && 'Total: ' + data.totalTime].filter(Boolean).join(' · ');
      if (id) { delete detailState[id]; S.update(id, data); location.hash = '#/r/' + id; toast('Changes saved ✓'); }
      else { data.source = 'manual'; var n = S.add([data])[0]; location.hash = '#/r/' + n.id; toast('Recipe added ✓'); }
    };
  }

  // ---------- family sharing / account sheet ----------
  var authMode = 'signin'; // signin | signup | forgot | magic
  function openSync() { renderSyncSheet(); $('#syncDlg').showModal(); }
  function pwField(name, ph, ac) {
    return '<div style="position:relative"><input class="input" type="password" name="' + name + '" required minlength="6" placeholder="' + ph + '" autocomplete="' + ac + '" style="padding-right:76px">' +
      '<button type="button" class="pill" data-act="showpw" style="position:absolute;right:8px;top:7px;background:var(--paper)">Show</button></div>';
  }
  function renderSyncSheet() {
    var s = S.sync, b = $('#syncBody'), h, email = esc(localStorage.getItem('frb.email') || '');
    if (!s.configured) {
      h = '<h2>Family <em>sharing</em></h2><p>Right now your recipes are saved safely on this device. When family sharing is turned on, recipes appear on everyone’s phones automatically — nothing you’ve added will be lost.</p><div class="row-end"><button class="btn" data-close>Got it</button></div>';
    } else if (s.recovery) {
      h = '<h2>Choose a new <em>password</em></h2><p>Pick something you’ll remember (at least 6 characters).</p>' +
        '<form id="newPwForm" class="form">' + pwField('password', 'New password', 'new-password') + '<button class="btn block">Save new password</button></form>';
    } else if (!s.user) {
      var tabs = '<div class="seg" style="position:static;margin:0 0 14px"><button type="button" class="' + (authMode === 'signin' ? 'on' : '') + '" data-auth="signin">Sign in</button><button type="button" class="' + (authMode === 'signup' ? 'on' : '') + '" data-auth="signup">New account</button></div>';
      if (authMode === 'signup') {
        h = '<h2>Make your <em>account</em></h2><p>Just an email and a password. Then your recipes can be shared with the family.</p>' + tabs +
          '<form id="signupForm" class="form"><input class="input" type="email" name="email" required placeholder="Your email" autocomplete="email" value="' + email + '">' +
          pwField('password', 'Choose a password (6+ characters)', 'new-password') + '<button class="btn block">Create account</button></form>';
      } else if (authMode === 'forgot') {
        h = '<h2>Forgot your <em>password?</em></h2><p>We’ll email you a link to choose a new one. Open the email on this phone.</p>' +
          '<form id="forgotForm" class="form"><input class="input" type="email" name="email" required placeholder="Your email" autocomplete="email" value="' + email + '"><button class="btn block">Email me a reset link</button></form>' +
          '<div class="row-end" style="margin-top:12px"><button class="pill" data-auth="signin">Back to sign in</button></div>';
      } else if (authMode === 'magic') {
        h = '<h2>Sign in with a <em>link</em></h2><p>We’ll email you a sign-in link. Note: on iPhone the link opens in Safari, not the Home Screen app — the password option works best there.</p>' +
          '<form id="magicForm" class="form"><input class="input" type="email" name="email" required placeholder="Your email" autocomplete="email" value="' + email + '"><button class="btn block">Email me a sign-in link</button></form>' +
          '<div class="row-end" style="margin-top:12px"><button class="pill" data-auth="signin">Back to sign in</button></div>';
      } else {
        h = '<h2>Welcome <em>back</em></h2><p>Sign in to share recipes with the family.</p>' + tabs +
          '<form id="signinForm" class="form"><input class="input" type="email" name="email" required placeholder="Your email" autocomplete="email" value="' + email + '">' +
          pwField('password', 'Password', 'current-password') + '<button class="btn block">Sign in</button></form>' +
          '<div class="row-end" style="margin-top:12px;justify-content:space-between"><button class="pill" data-auth="forgot">Forgot password?</button><button class="pill" data-auth="magic">Email me a link instead</button></div>';
      }
      h += '<div class="row-end" style="margin-top:14px"><button class="btn ghost" data-close>Not now</button></div>';
    } else if (!s.familyId) {
      h = '<h2>Your <em>family</em></h2><p>Signed in as ' + esc(s.user.email) + '. Type the family code you were given, or start a new family book.</p>' +
        '<form id="joinForm" class="form"><input class="input" name="code" placeholder="Family code, e.g. OLIVE-4821" autocapitalize="characters" required><button class="btn block">Join family</button></form>' +
        '<form id="createForm" class="form" style="margin-top:14px"><input class="input" name="name" placeholder="Family name (optional)"><button class="btn ghost block">Start a new family book</button></form>' +
        '<div class="row-end" style="margin-top:12px"><button class="btn ghost" data-act="signout">Sign out</button></div>';
    } else {
      h = '<h2>Family sharing is <em>on</em></h2><p>' + (s.status === 'synced' ? 'Everything is up to date. New recipes appear on all devices automatically.' : s.status === 'error' ? 'Having trouble syncing: ' + esc(s.error) + '. Your recipes are still saved on this device.' : 'Syncing…') + '</p>' +
        '<p>Share this code so others can join:</p><div class="code">' + esc(s.familyCode || '—') + '</div>' +
        '<div class="row-end" style="margin-top:16px"><button class="btn ghost" data-act="signout">Sign out</button><button class="btn" data-close>Done</button></div>';
    }
    b.innerHTML = h;
    function friendly(e) {
      var m = (e && e.message) || 'Something went wrong';
      if (/invalid login/i.test(m)) return 'That email and password don’t match. Try again, or tap “Forgot password?”';
      if (/already registered/i.test(m)) return 'There’s already an account with that email — tap “Sign in”.';
      if (/rate limit/i.test(m)) return 'Too many tries — please wait a minute and try again.';
      if (/email not confirmed/i.test(m)) return 'Please confirm your email first (check your inbox).';
      return m;
    }
    function busy(form, p, okMsg, after) {
      var btn = form.querySelector('button:not([type="button"])'); btn.disabled = true;
      p.then(function (res) { if (res && res.error) throw res.error; if (okMsg) toast(okMsg); if (after) after(res); renderSyncSheet(); })
        .catch(function (e) { toast(friendly(e)); btn.disabled = false; });
    }
    function rememberEmail(f) { localStorage.setItem('frb.email', f.email.value.trim()); return f.email.value.trim(); }
    var f;
    if ((f = $('#signinForm'))) f.onsubmit = function (e) { e.preventDefault(); busy(f, S.signIn(rememberEmail(f), f.password.value), 'Signed in ✓'); };
    if ((f = $('#signupForm'))) f.onsubmit = function (e) { e.preventDefault(); var ff = e.target; busy(ff, S.signUp(rememberEmail(ff), ff.password.value), null, function (res) {
      toast(res && res.data && res.data.session ? 'Account created ✓' : 'Account created — check your email to confirm it');
    }); };
    if ((f = $('#forgotForm'))) f.onsubmit = function (e) { e.preventDefault(); var ff = e.target; busy(ff, S.resetPassword(rememberEmail(ff)), 'Check your email for the reset link ✉️', function () { authMode = 'signin'; }); };
    if ((f = $('#magicForm'))) f.onsubmit = function (e) { e.preventDefault(); var ff = e.target; busy(ff, S.sendMagicLink(rememberEmail(ff)), 'Check your email ✉️'); };
    if ((f = $('#newPwForm'))) f.onsubmit = function (e) { e.preventDefault(); var ff = e.target; busy(ff, S.setNewPassword(ff.password.value), 'Password updated ✓'); };
    if ((f = $('#joinForm'))) f.onsubmit = function (e) { e.preventDefault(); var ff = e.target; busy(ff, S.joinFamily(ff.code.value), 'Welcome to the family book!'); };
    if ((f = $('#createForm'))) f.onsubmit = function (e) { e.preventDefault(); var ff = e.target; busy(ff, S.createFamily(ff.name.value), 'Family book created'); };
  }

  // ---------- global events ----------
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act],[data-chip],[data-close],[data-auth],[data-add]'); if (!t) return;
    if (t.hasAttribute('data-close')) { $('#syncDlg').close(); return; }
    if (t.dataset.auth) { authMode = t.dataset.auth; renderSyncSheet(); return; }
    if (t.dataset.add) {
      var span = t.closest('.miss'), fld = t.dataset.add, i = t.dataset.i;
      if (fld === 'ingredients' || fld === 'steps') { toast('Add those after saving — tap Edit on the recipe'); return; }
      span.innerHTML = '<input data-i="' + i + '" data-f="fact" data-field="' + fld + '" placeholder="' + (fld === 'servings' ? '4' : '45 min') + '" aria-label="' + (fld === 'servings' ? 'Serves' : 'Total time') + '">';
      span.querySelector('input').focus(); return;
    }
    if (t.dataset.chip) {
      if (t.dataset.chip === 'fav') { view.fav = !view.fav; if (view.fav) view.cat = 'All'; }
      else { view.cat = t.dataset.chip; view.fav = false; }
      saveView(); renderGrid(); window.scrollTo({ top: 0, behavior: 'smooth' }); return;
    }
    var act = t.dataset.act, id = t.dataset.id;
    if (act === 'fav') { var r = S.get(id); S.update(id, { favorite: !r.favorite }); haptic(); toast(r.favorite ? 'Removed from favorites' : 'Added to favorites ♥'); }
    else if (act === 'del') deleteRecipe(id);
    else if (act === 'tick') {
      var rid = currentRoute.slice(4), st = detailState[rid], k = t.dataset.i;
      st.done[k] = !st.done[k]; t.classList.toggle('done', st.done[k]); t.setAttribute('aria-checked', st.done[k]);
      var n = Object.keys(st.done).filter(function (x) { return st.done[x]; }).length; var x = $('#ing .x'); if (x) x.textContent = n + ' of ' + $$('#ing li[data-act="tick"]').length;
    }
    else if (act === 'serv') {
      var sid = currentRoute.slice(4), ds = detailState[sid];
      ds.servings = Math.max(1, Math.min(99, ds.servings + +t.dataset.d)); var y = window.scrollY; renderDetail(sid); window.scrollTo(0, y);
    }
    else if (act === 'timer') {
      var idx = $$('.tm').indexOf(t), key = currentRoute + idx;
      if (timers[key]) { delete timers[key]; var y2 = window.scrollY; renderDetail(currentRoute.slice(4)); window.scrollTo(0, y2); }
      else { timers[key] = { end: Date.now() + (+t.dataset.s) * 1000 }; paintTimer(t, timers[key]); haptic(); }
    }
    else if (act === 'share') shareRecipe(S.get(id));
    else if (act === 'showpw') { var inp = t.previousElementSibling; inp.type = inp.type === 'password' ? 'text' : 'password'; t.textContent = inp.type === 'password' ? 'Show' : 'Hide'; }
    else if (act === 'clear') { view = { q: '', cat: 'All', fav: false, sort: view.sort }; saveView(); renderList(); }
    else if (act === 'signout') S.signOut().then(renderSyncSheet);
  });
  function shareRecipe(r) {
    var text = r.title + '\n\n' + (r.servings ? 'Serves ' + r.servings + '\n' : '') + (r.totalTime || r.time ? 'Time: ' + (r.totalTime || r.time) + '\n' : '') +
      '\nIngredients\n' + r.ingredients.map(function (x) { return isGroup(x) ? '\n' + x.slice(3) + ':' : '• ' + x; }).join('\n') +
      '\n\nSteps\n' + r.steps.filter(function (x) { return !isGroup(x); }).map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n') + (r.notes ? '\n\nNote: ' + r.notes : '');
    if (navigator.share) navigator.share({ title: r.title, text: text }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast('Recipe copied — paste it anywhere'); });
  }
  $('#syncDlg').addEventListener('click', function (e) { if (e.target === this) this.close(); });

  // ---------- router ----------
  function route() {
    var h = location.hash || '#/', m;
    currentRoute = h;
    var cta = $('.cta-wrap'); if (cta && h !== '#/import') cta.remove();
    if ((m = h.match(/^#\/r\/(.+)$/))) renderDetail(m[1]);
    else if (h === '#/import') renderImport();
    else if (h === '#/new') renderEdit(null);
    else if ((m = h.match(/^#\/edit\/(.+)$/))) renderEdit(m[1]);
    else renderList();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  function updateDot() {
    var dot = $('#syncDot'); if (!dot) return; var s = S.sync;
    dot.className = 'dot' + (s.status === 'synced' ? ' on' : s.status === 'error' ? ' err' : '');
  }
  S.subscribe(function (recipes, sync) {
    updateDot();
    if (!currentRoute) return;
    if (/^#\/r\//.test(currentRoute)) { var y = window.scrollY; renderDetail(currentRoute.slice(4)); window.scrollTo(0, y); }
    else if (currentRoute === '#/' || currentRoute === '') renderGrid();
    if ($('#syncDlg').open) renderSyncSheet();
    if (sync.recovery && !$('#syncDlg').open) openSync();
  });
  S.init();
  route();

  // ---------- Add to Home Screen hint (iOS Safari) ----------
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  var forced = /[?&]a2hs=1/.test(location.search);
  if ((isIOS && !standalone && !localStorage.getItem('frb.a2hs.dismissed')) || forced) { $('#a2hs').hidden = false; document.body.classList.add('has-a2hs'); }
  $('#a2hsClose').onclick = function () { $('#a2hs').hidden = true; document.body.classList.remove('has-a2hs'); localStorage.setItem('frb.a2hs.dismissed', '1'); };

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
