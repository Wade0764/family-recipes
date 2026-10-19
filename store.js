/* Data layer: localStorage (always, also the offline cache) + optional Supabase family sync. */
(function () {
  'use strict';
  var KEY = 'frb.recipes.v1';
  var PENDING = 'frb.pending.v1'; // { upserts: [ids], deletes: [ids] }
  var listeners = [];
  var recipes = [];
  var sync = { configured: false, client: null, user: null, familyId: null, familyCode: null, status: 'local', channel: null, error: '' };

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function readJSON(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(recipes)); } catch (e) { console.warn(e); } }
  function emit() { listeners.forEach(function (fn) { fn(recipes, sync); }); }
  function pending() { return readJSON(PENDING, { upserts: [], deletes: [] }); }
  function setPending(p) { localStorage.setItem(PENDING, JSON.stringify(p)); }
  function markPending(kind, id) {
    var p = pending();
    ['upserts', 'deletes'].forEach(function (k) { p[k] = p[k].filter(function (x) { return x !== id; }); });
    p[kind].push(id); setPending(p);
  }

  function normalize(r) {
    var now = new Date().toISOString();
    return {
      id: r.id || uuid(),
      title: String(r.title || 'Untitled recipe').trim(),
      category: window.RecipeParser ? window.RecipeParser.migrateCategory(r.category || 'Other', r.title) : (r.category || 'Other'),
      ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
      steps: Array.isArray(r.steps) ? r.steps : [],
      servings: r.servings || '',
      time: r.time || '',
      prepTime: r.prepTime || '',
      cookTime: r.cookTime || '',
      totalTime: r.totalTime || '',
      description: r.description || '',
      source: r.source || 'manual',
      notes: r.notes || '',
      rating: Math.max(0, Math.min(5, Math.round((Number(r.rating) || 0) * 2) / 2)), // 0-5 in half steps
      favorite: !!r.favorite,
      createdAt: r.createdAt || now,
      updatedAt: r.updatedAt || now
    };
  }
  function toRow(r) {
    return { id: r.id, family_id: sync.familyId, title: r.title, category: r.category, ingredients: r.ingredients, steps: r.steps,
      servings: r.servings, time: r.time, prep_time: r.prepTime, cook_time: r.cookTime, total_time: r.totalTime,
      description: r.description, source: r.source, notes: r.notes, rating: r.rating, favorite: r.favorite,
      created_at: r.createdAt, updated_at: r.updatedAt };
  }
  function fromRow(x) {
    return normalize({ id: x.id, title: x.title, category: x.category, ingredients: x.ingredients, steps: x.steps, servings: x.servings,
      time: x.time, prepTime: x.prep_time, cookTime: x.cook_time, totalTime: x.total_time,
      description: x.description, source: x.source, notes: x.notes, rating: x.rating, favorite: x.favorite, createdAt: x.created_at, updatedAt: x.updated_at });
  }

  // ---------- remote helpers ----------
  function remoteOn() { return sync.client && sync.user && sync.familyId; }
  function pushUpsert(r) {
    if (!remoteOn()) { markPending('upserts', r.id); return Promise.resolve(); }
    return sync.client.from('recipes').upsert(toRow(r)).then(function (res) {
      if (res.error) { markPending('upserts', r.id); setError(res.error); }
    });
  }
  function pushDelete(id) {
    if (!remoteOn()) { markPending('deletes', id); return Promise.resolve(); }
    return sync.client.from('recipes').delete().eq('id', id).then(function (res) {
      if (res.error) { markPending('deletes', id); setError(res.error); }
    });
  }
  function setError(e) { sync.error = (e && e.message) || String(e); console.warn('sync', e); emit(); }

  function flushPending() {
    if (!remoteOn()) return Promise.resolve();
    var p = pending(); setPending({ upserts: [], deletes: [] });
    var ups = p.upserts.map(function (id) { return recipes.find(function (r) { return r.id === id; }); }).filter(Boolean);
    var jobs = [];
    if (ups.length) jobs.push(sync.client.from('recipes').upsert(ups.map(toRow)).then(function (res) {
      if (res.error) { ups.forEach(function (r) { markPending('upserts', r.id); }); setError(res.error); }
    }));
    p.deletes.forEach(function (id) { jobs.push(pushDelete(id)); });
    return Promise.all(jobs);
  }

  function pullAll() {
    return sync.client.from('recipes').select('*').eq('family_id', sync.familyId).then(function (res) {
      if (res.error) throw res.error;
      var p = pending();
      var remote = res.data.map(fromRow).filter(function (r) { return p.deletes.indexOf(r.id) < 0; });
      var dirty = recipes.filter(function (r) { return p.upserts.indexOf(r.id) >= 0; });
      var byId = {};
      remote.forEach(function (r) { byId[r.id] = r; });
      dirty.forEach(function (r) { byId[r.id] = r; });
      recipes = Object.keys(byId).map(function (k) { return byId[k]; });
      persist(); emit();
    });
  }

  function migrateLocalUp() {
    var flag = 'frb.migrated.' + sync.familyId;
    if (localStorage.getItem(flag)) return Promise.resolve();
    if (!recipes.length) { localStorage.setItem(flag, '1'); return Promise.resolve(); }
    return sync.client.from('recipes').upsert(recipes.map(toRow)).then(function (res) {
      if (res.error) throw res.error;
      localStorage.setItem(flag, '1');
    });
  }

  function subscribe() {
    if (sync.channel) sync.client.removeChannel(sync.channel);
    sync.channel = sync.client.channel('recipes-' + sync.familyId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes', filter: 'family_id=eq.' + sync.familyId }, function (payload) {
        if (payload.eventType === 'DELETE') {
          var id = payload.old && payload.old.id;
          recipes = recipes.filter(function (r) { return r.id !== id; });
        } else {
          var incoming = fromRow(payload.new);
          var i = recipes.findIndex(function (r) { return r.id === incoming.id; });
          if (i < 0) recipes.push(incoming);
          else if (incoming.updatedAt >= recipes[i].updatedAt) recipes[i] = incoming;
        }
        persist(); emit();
      })
      .subscribe();
  }

  function loadMembership() {
    return sync.client.from('family_members').select('family_id, families(code, name)').eq('user_id', sync.user.id).limit(1).then(function (res) {
      if (res.error) throw res.error;
      var m = res.data && res.data[0];
      sync.familyId = m ? m.family_id : null;
      sync.familyCode = m && m.families ? m.families.code : null;
    });
  }

  function startFamilySync() {
    sync.status = 'syncing'; sync.error = ''; emit();
    return migrateLocalUp().then(flushPending).then(pullAll).then(function () {
      subscribe(); sync.status = 'synced'; emit();
    }).catch(function (e) { sync.status = 'error'; setError(e); });
  }

  function onSession(session) {
    sync.user = session ? session.user : null;
    if (!sync.user) { sync.familyId = null; sync.status = 'signed-out'; emit(); return Promise.resolve(); }
    return loadMembership().then(function () {
      if (!sync.familyId) { sync.status = 'needs-family'; emit(); return; }
      return startFamilySync();
    }).catch(function (e) { sync.status = 'error'; setError(e); });
  }

  // ---------- public API ----------
  var Store = {
    sync: sync,
    init: function () {
      recipes = readJSON(KEY, []).map(normalize);
      var cfg = window.RECIPE_CONFIG || {};
      sync.configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
      if (sync.configured) {
        try {
          sync.client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
          });
          sync.status = 'signed-out';
          sync.client.auth.getSession().then(function (r) { onSession(r.data.session); });
          sync.client.auth.onAuthStateChange(function (evt, session) {
            if (evt === 'PASSWORD_RECOVERY') { sync.recovery = true; emit(); }
            if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT') onSession(session);
          });
          window.addEventListener('online', function () { if (remoteOn()) startFamilySync(); });
          // Realtime filtered DELETE events are not guaranteed, so re-pull when the app comes back to the foreground.
          document.addEventListener('visibilitychange', function () { if (!document.hidden && remoteOn()) flushPending().then(pullAll).catch(setError); });
        } catch (e) { sync.configured = false; sync.error = e.message; }
      }
      emit();
    },
    subscribe: function (fn) { listeners.push(fn); fn(recipes, sync); },
    all: function () { return recipes.slice(); },
    get: function (id) { return recipes.find(function (r) { return r.id === id; }); },
    add: function (list) {
      var stamp = Date.now();
      var added = list.map(function (r, i) {
        return normalize(Object.assign({}, r, { id: null, createdAt: new Date(stamp + i).toISOString(), updatedAt: new Date(stamp + i).toISOString() }));
      });
      recipes = recipes.concat(added); persist(); emit();
      added.forEach(pushUpsert);
      return added;
    },
    update: function (id, patch) {
      var i = recipes.findIndex(function (r) { return r.id === id; });
      if (i < 0) return null;
      recipes[i] = normalize(Object.assign({}, recipes[i], patch, { id: id, updatedAt: new Date().toISOString() }));
      persist(); emit(); pushUpsert(recipes[i]);
      return recipes[i];
    },
    remove: function (id) {
      var r = Store.get(id);
      recipes = recipes.filter(function (x) { return x.id !== id; });
      persist(); emit(); pushDelete(id);
      return r;
    },
    restore: function (r) {
      recipes.push(normalize(Object.assign({}, r, { updatedAt: new Date().toISOString() })));
      persist(); emit(); pushUpsert(Store.get(r.id));
    },
    // auth: email + password is primary (works inside the Home Screen app); magic link is secondary
    signUp: function (email, password) {
      return sync.client.auth.signUp({ email: email, password: password, options: { emailRedirectTo: location.origin + location.pathname } });
    },
    signIn: function (email, password) {
      return sync.client.auth.signInWithPassword({ email: email, password: password });
    },
    resetPassword: function (email) {
      return sync.client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    },
    setNewPassword: function (password) {
      return sync.client.auth.updateUser({ password: password }).then(function (res) { if (!res.error) { sync.recovery = false; emit(); } return res; });
    },
    // auth + family
    sendMagicLink: function (email) {
      return sync.client.auth.signInWithOtp({ email: email, options: { emailRedirectTo: location.origin + location.pathname } });
    },
    verifyCode: function (email, token) {
      return sync.client.auth.verifyOtp({ email: email, token: token, type: 'email' });
    },
    signOut: function () { return sync.client.auth.signOut(); },
    createFamily: function (name) {
      return sync.client.rpc('create_family', { p_name: name || 'Our Family' }).then(function (res) {
        if (res.error) throw res.error; return onSession({ user: sync.user });
      });
    },
    joinFamily: function (code) {
      return sync.client.rpc('join_family', { p_code: String(code).trim().toUpperCase() }).then(function (res) {
        if (res.error) throw res.error; return onSession({ user: sync.user });
      });
    }
  };
  window.Store = Store;
})();
