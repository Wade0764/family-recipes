/* Family Recipe Book: free client-side parser for ChatGPT-style recipe pastes. */
(function (root) {
  'use strict';
  // Desi's auto-sort categories. 'Other' is only a fallback when nothing matches.
  var CATEGORIES = ['Breakfast', 'Soups & Stews', 'Mains', 'Sides', 'Salads', 'Baking', 'Desserts', 'Drinks', 'Other'];

  // Priority order matters: first category whose keywords hit the title wins.
  var RULES = [
    ['Drinks', ['smoothie', 'lemonade', 'cocktail', 'mocktail', 'latte', 'iced tea', 'chai', 'hot chocolate', 'cocoa', 'punch', 'margarita', 'sangria', 'milkshake', 'shake', 'spritzer', 'juice', 'coffee', 'cider', 'eggnog', 'mojito']],
    ['Breakfast', ['breakfast', 'pancake', 'waffle', 'omelet', 'omelette', 'frittata', 'quiche', 'granola', 'oatmeal', 'porridge', 'overnight oats', 'french toast', 'scrambled', 'hash brown', 'hash', 'eggs benedict', 'crepe', 'brunch', 'shakshuka', 'parfait']],
    ['Soups & Stews', ['soup', 'stew', 'chowder', 'chili', 'bisque', 'gazpacho', 'broth', 'minestrone', 'pho', 'ramen', 'gumbo', 'goulash']],
    ['Salads', ['salad', 'slaw', 'coleslaw', 'caesar', 'tabbouleh', 'panzanella']],
    ['Desserts', ['cookie', 'brownie', 'blondie', 'pie', 'cake', 'cupcake', 'cheesecake', 'pudding', 'ice cream', 'tart', 'cobbler', 'crumble', 'crisp', 'fudge', 'mousse', 'tiramisu', 'custard', 'dessert', 'truffle', 'macaron', 'sorbet', 'frosting', 'bars']],
    ['Baking', ['bread', 'muffin', 'scone', 'biscuit', 'focaccia', 'roll', 'loaf', 'sourdough', 'bagel', 'brioche', 'baguette', 'pretzel', 'croissant', 'cornbread', 'dough', 'cinnamon roll']],
    ['Sides', ['side', 'mashed', 'roasted vegetables', 'roasted potatoes', 'pilaf', 'green beans', 'asparagus', 'brussels sprouts', 'fries', 'glazed carrots', 'stuffing', 'risotto', 'corn on the cob', 'gratin', 'sauteed', 'sautéed', 'rice',
      'dip', 'hummus', 'guacamole', 'salsa', 'bruschetta', 'deviled eggs', 'appetizer', 'nachos', 'popcorn', 'snack']],
    ['Mains', ['chicken', 'beef', 'pork', 'salmon', 'fish', 'shrimp', 'steak', 'pasta', 'spaghetti', 'lasagna', 'taco', 'curry', 'burger', 'casserole', 'stir-fry', 'stir fry', 'enchilada', 'meatball', 'meatloaf', 'pizza', 'turkey', 'lamb', 'tofu', 'fajita', 'roast', 'noodle', 'sandwich', 'burrito', 'quesadilla', 'ribs', 'dinner', 'bolognese', 'alfredo', 'mac and cheese', 'pot pie']]
  ];

  // Map categories saved by the first version of the app onto Desi's set.
  function migrateCategory(cat, title) {
    if (CATEGORIES.indexOf(cat) >= 0) return cat;
    if (cat === 'Soups & Salads') return /salad|slaw/i.test(title || '') ? 'Salads' : 'Soups & Stews';
    if (cat === 'Snacks') return 'Sides';
    return 'Other';
  }

  function kwRegex(k) {
    var e = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s-]+');
    return new RegExp('(^|[^a-z])' + e + '(s|es)?([^a-z]|$)', 'i');
  }
  RULES.forEach(function (r) { r[2] = r[1].map(kwRegex); });

  function categorize(title, ingredients) {
    var t = String(title || '');
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i][2].some(function (re) { return re.test(t); })) return RULES[i][0];
    }
    // Fall back to ingredients: proteins suggest a main, flour+sugar suggests baking.
    var ing = (ingredients || []).join(' ').toLowerCase();
    if (/\b(chicken|beef|pork|salmon|shrimp|steak|ground turkey|lamb|tofu)\b/.test(ing)) return 'Mains';
    if (/\bflour\b/.test(ing) && /\bsugar\b/.test(ing)) return /\byeast\b/.test(ing) ? 'Baking' : 'Desserts';
    if (/\byeast\b/.test(ing)) return 'Baking';
    return 'Other';
  }

  function clean(s) {
    return String(s)
      .replace(/\*\*|__/g, '')
      .replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|$|[.,:;!?])/g, '$1$2')
      .replace(/`/g, '')
      .replace(/^\s*\[[ xX]?\]\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  var SECTION_RE = /^(?:#{1,6}\s*)?(?:\*\*|__)?\s*[\p{Extended_Pictographic}\u200d\uFE0F\s]*(ingredients?|what you(?:'|’)?ll need|you(?:'|’)?ll need|instructions?|directions?|method|steps?|preparation|how to make(?: it)?|notes?|tips?|chef(?:'|’)?s notes?|variations?|serving suggestions?)\b([^:]*?)(?:\*\*|__)?\s*:?\s*(?:\*\*|__)?\s*$/iu;
  var META_RE = /^(?:[-*•]\s*)?(?:\*\*|__)?\s*(servings?|serves|yield|yields|makes|prep(?:aration)? time|cook(?:ing)? time|bake time|total time|time|active time)\s*(?:\*\*|__)?\s*[:\-–]\s*(?:\*\*|__)?\s*(.+)$/i;
  var LOOSE_META_RE = /^(servings?|serves|yield|yields|makes|prep(?:aration)?(?: time)?|cook(?:ing)?(?: time)?|bake(?: time)?|total(?: time)?|active(?: time)?)\s*[:\-–]?\s*(\d.*|about .*)$/i;
  var LIST_RE = /^\s*(?:[-*•+–]|\d{1,2}[.)]|step\s*\d+[:.)]?)\s+(.*)$/i;
  var HEADING_RE = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/;
  var BOLD_LINE_RE = /^\s*(?:\d{1,2}[.)]\s*)?(?:\*\*|__)(.+?)(?:\*\*|__)\s*:?\s*$/;
  var RECIPE_LABEL_RE = /^\s*(?:recipe\s*(?:#?\d+)?\s*[:.\-–]\s*)(.+)$/i;
  var CHATTER_RE = /^(enjoy|let me know|would you like|i hope|hope you|bon app|happy (cooking|baking)|here (are|is|'s)|sure[!,.]|absolutely[!,.]|great choice|feel free|if you('d| would) like|want me to)/i;
  var SEPARATOR_RE = /^\s*([-*_=]\s*){3,}$/;

  function sectionKind(name) {
    name = name.toLowerCase();
    if (/ingredient|need/.test(name)) return 'ingredients';
    if (/note|tip|variation|serving/.test(name)) return 'notes';
    return 'steps';
  }

  function classify(raw) {
    var line = raw.replace(/\u00a0/g, ' ').replace(/\s+$/, '');
    if (!line.trim()) return { type: 'blank' };
    if (SEPARATOR_RE.test(line)) return { type: 'sep' };
    var m = line.match(SECTION_RE);
    if (m && m[2].length < 40) {
      return { type: 'section', kind: sectionKind(m[1]), extra: clean(m[2]).replace(/^[(\-–\s]+|[)\s]+$/g, '') };
    }
    m = line.match(META_RE);
    if (m && m[2].length < 80 && !/[·|]/.test(m[2])) return { type: 'meta', key: m[1].toLowerCase(), value: clean(m[2]) };
    // "Serves 4 · Prep 10 min · Cook 15 min" (no colons, several facts on one line)
    var segs = clean(line).replace(/^[-*•]\s*/, '').split(/\s*[·|•]\s*|\s{2,}|,\s*(?=(?:serves|prep|cook|total|makes)\b)/i).filter(Boolean);
    var metas = segs.map(function (g) { var x = g.match(LOOSE_META_RE); return x && { key: x[1].toLowerCase(), value: x[2].trim() }; });
    if (segs.length && segs.length <= 5 && metas.every(Boolean)) return { type: 'metas', items: metas };
    m = line.match(HEADING_RE);
    if (m) return { type: 'heading', text: clean(m[1]) };
    m = line.match(BOLD_LINE_RE);
    if (m && !/\*\*|__/.test(m[1])) return { type: 'heading', text: clean(m[1]), bold: true, numbered: /^\s*\d/.test(line) };
    m = line.match(LIST_RE);
    if (m) return { type: 'item', text: clean(m[1]), numbered: /^\s*\d/.test(line) };
    m = line.match(RECIPE_LABEL_RE);
    if (m) return { type: 'heading', text: clean(m[1]) };
    return { type: 'text', text: clean(line) };
  }

  function stripTitle(t) {
    return t
      .replace(/^(?:\d{1,2}[.)]\s*|recipe\s*#?\d*\s*[:.\-–]\s*)/i, '')
      .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\s]+/u, '')
      .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\s]+$/u, '')
      .replace(/[:\s]+$/, '')
      .trim();
  }

  function isSubgroup(text) {
    return /:$/.test(text) || /^for (the )?/i.test(text) || /^(sauce|dressing|topping|glaze|filling|frosting|crust|marinade)s?$/i.test(text);
  }

  // Does an ingredients section (or a list) follow before the next title-ish line?
  function looksLikeRecipeStart(lines, i, strict) {
    var seen = 0;
    for (var j = i + 1; j < lines.length && seen < (strict ? 4 : 30); j++) {
      var c = lines[j];
      if (c.type === 'blank') continue;
      seen++;
      if (c.type === 'section') return c.kind === 'ingredients' || !strict;
      if (c.type === 'heading' && !isSubgroup(c.text)) return false;
      if (c.type === 'item' && strict) return false;
    }
    return false;
  }

  function newRecipe(title) {
    return { title: title || '', ingredients: [], steps: [], notes: [], servings: '', time: [], prep: '', cook: '', total: '', description: [] };
  }

  function hasBody(r) { return r && (r.ingredients.length || r.steps.length); }

  function parseRecipes(input) {
    var text = String(input || '').replace(/\r\n?/g, '\n');
    var lines = text.split('\n').map(classify);
    var recipes = [];
    var cur = null;
    var section = null;

    function applyMeta(key, value) {
      if (/serv|yield|makes/.test(key)) { cur.servings = value; return; }
      if (/prep|active/.test(key)) cur.prep = value;
      else if (/cook|bake/.test(key)) cur.cook = value;
      else cur.total = value;
      cur.time.push((key === 'time' ? '' : key.replace(/^\w/, function (x) { return x.toUpperCase(); }) + ': ') + value);
    }
    function startRecipe(title) {
      if (cur && hasBody(cur)) recipes.push(cur);
      else if (cur && !hasBody(cur) && cur.title && !title) title = cur.title;
      cur = newRecipe(stripTitle(title || ''));
      section = null;
    }

    for (var i = 0; i < lines.length; i++) {
      var c = lines[i];
      if (c.type === 'blank' || c.type === 'sep') continue;

      if (c.type === 'heading') {
        if (isSubgroup(c.text) && cur && section) {
          var label = c.text.replace(/:$/, '');
          (section === 'ingredients' ? cur.ingredients : section === 'steps' ? cur.steps : cur.notes).push('## ' + label);
          continue;
        }
        if (c.numbered && section === 'steps' && !looksLikeRecipeStart(lines, i, true)) {
          cur.steps.push(c.text); continue;
        }
        if (looksLikeRecipeStart(lines, i, false)) { startRecipe(c.text); continue; }
        if (cur && section) { // stray bold line inside a section
          (section === 'ingredients' ? cur.ingredients : section === 'steps' ? cur.steps : cur.notes).push(c.text);
        }
        continue;
      }

      if (c.type === 'text' && CHATTER_RE.test(c.text) && !(cur && section === 'steps' && !/^(enjoy|let me know|would you|i hope|hope you|want me|if you)/i.test(c.text))) {
        continue;
      }

      if (c.type === 'text' && c.text.length <= 70 && !/[.!?]$/.test(c.text) && looksLikeRecipeStart(lines, i, true) && (!cur || hasBody(cur) || !cur.title)) {
        startRecipe(c.text); continue;
      }

      if (c.type === 'section') {
        if (!cur) startRecipe('');
        if (c.kind === 'ingredients' && cur.ingredients.length && cur.steps.length) { startRecipe(''); }
        section = c.kind;
        if (c.extra && c.kind !== 'notes') {
          (section === 'ingredients' ? cur.ingredients : cur.steps).push('## ' + c.extra.replace(/^for\s+/i, 'For '));
        }
        continue;
      }

      if (c.type === 'metas') {
        if (!cur) startRecipe('');
        c.items.forEach(function (it) { applyMeta(it.key, it.value); });
        continue;
      }
      if (c.type === 'meta') {
        if (!cur) startRecipe('');
        applyMeta(c.key, c.value);
        continue;
      }

      if (!cur) {
        // Content before any title: only start a recipe if a list or section is coming.
        if (c.type === 'item') { startRecipe(''); }
        else continue;
      }

      var t = c.text;
      if (!t) continue;
      if (section === 'ingredients') cur.ingredients.push(t);
      else if (section === 'steps') cur.steps.push(t.replace(/^step\s*\d+[:.)]?\s*/i, ''));
      else if (section === 'notes') cur.notes.push(t);
      else if (c.type === 'item') {
        if (!cur.ingredients.length || (!c.numbered && !cur.steps.length)) cur.ingredients.push(t); else cur.steps.push(t);
      } else cur.description.push(t);
    }
    if (cur && hasBody(cur)) recipes.push(cur);

    return recipes.map(function (r, idx) {
      var title = r.title || (r.description[0] && r.description[0].length < 70 ? r.description.shift() : '') || ('Recipe ' + (idx + 1));
      var total = r.total;
      if (!total && (r.prep || r.cook)) {
        var m = parseMinutes(r.prep) + parseMinutes(r.cook);
        if (m) total = formatMinutes(m);
      }
      return {
        title: title,
        category: categorize(title, r.ingredients),
        ingredients: r.ingredients,
        steps: r.steps,
        servings: r.servings,
        time: r.time.join(' · '),
        prepTime: r.prep, cookTime: r.cook, totalTime: total,
        description: r.description.join(' '),
        notes: r.notes.join('\n'),
        source: 'paste'
      };
    });
  }

  // "1 hour 15 minutes", "1 hr 15 min", "3h", "45 mins", "1 1/2 hours" -> minutes (0 if unknown)
  function parseMinutes(str) {
    if (!str) return 0;
    var s = String(str).toLowerCase().replace(/(\d+)\s+1\/2/g, function (_, n) { return (+n + 0.5) + ''; }).replace(/½/g, '.5');
    var h = s.match(/(\d+(?:\.\d+)?)\s*(?:-\s*\d+(?:\.\d+)?\s*)?(?:hours?|hrs?|h)\b/);
    var m = s.match(/(\d+)\s*(?:-\s*\d+\s*)?(?:minutes?|mins?|m)\b/);
    var total = (h ? parseFloat(h[1]) * 60 : 0) + (m ? parseInt(m[1], 10) : 0);
    return Math.round(total);
  }
  function formatMinutes(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min';
  }

  var api = { parseRecipes: parseRecipes, categorize: categorize, migrateCategory: migrateCategory, parseMinutes: parseMinutes, formatMinutes: formatMinutes, CATEGORIES: CATEGORIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RecipeParser = api;
})(this);
