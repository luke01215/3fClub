// 3F Club mockup test suite. No dependencies - run with:
//   node tests/run.mjs
//
// These are static, self-contained pages, so the suite checks the things that
// actually break them: malformed markup, dead internal links, undefined CSS
// variables, silently-missing webfonts, accessibility regressions, and the two
// layering bugs found during review.
//
// Caveat: the markup parser is purpose-built for these files, not a spec-
// compliant HTML parser. It is good enough to catch unbalanced tags in content
// we control; it is not a general-purpose validator.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCKUPS = path.join(ROOT, 'mockups');

const VOID = new Set(['area','base','br','col','embed','hr','img','input','link',
  'meta','param','source','track','wbr']);

// ---------------------------------------------------------------------------
// tiny test harness
// ---------------------------------------------------------------------------

let pass = 0, fail = 0;
const failures = [];

function check(file, name, ok, detail) {
  if (ok) { pass++; return true; }
  fail++;
  failures.push({ file, name, detail });
  return false;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Remove <script> and <style> bodies. Essential: JS contains `i<count` which
 *  a naive tag scanner would read as a tag open. */
function stripCode(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, m => '\n'.repeat((m.match(/\n/g) || []).length))
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,  m => '\n'.repeat((m.match(/\n/g) || []).length));
}

function styleBlocks(html) {
  return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
}

function scriptBlocks(html) {
  return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');
}

/** Walk tags with a stack. Returns {errors:[], tags:[{name,attrs,line}]} */
function parseTags(html) {
  const body = stripCode(html);
  const errors = [];
  const stack = [];
  const tags = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(body))) {
    const [full, closing, rawName, attrs, selfClose] = m;
    const name = rawName.toLowerCase();
    const line = body.slice(0, m.index).split('\n').length;
    if (closing) {
      if (!stack.length) { errors.push(`stray </${name}> at line ${line}`); continue; }
      // Unwind to the matching open tag, reporting anything left dangling.
      let idx = -1;
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name === name) { idx = i; break; }
      if (idx === -1) { errors.push(`</${name}> at line ${line} never opened`); continue; }
      for (let i = stack.length - 1; i > idx; i--) {
        errors.push(`<${stack[i].name}> opened line ${stack[i].line} never closed`);
      }
      stack.length = idx;
    } else if (!VOID.has(name) && !selfClose) {
      stack.push({ name, line });
      tags.push({ name, attrs, line });
    } else {
      tags.push({ name, attrs, line });
    }
  }
  for (const t of stack) errors.push(`<${t.name}> opened line ${t.line} never closed`);
  return { errors, tags, body };
}

function attr(attrs, key) {
  const m = attrs.match(new RegExp(`\\b${key}\\s*=\\s*"([^"]*)"`, 'i'))
        || attrs.match(new RegExp(`\\b${key}\\s*=\\s*'([^']*)'`, 'i'));
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// the checks
// ---------------------------------------------------------------------------

function testFile(file) {
  const name = path.basename(file);
  const html = fs.readFileSync(file, 'utf8');
  const css = styleBlocks(html);
  const js = scriptBlocks(html);
  const { errors, tags, body } = parseTags(html);

  // --- structure ---------------------------------------------------------
  check(name, 'markup is balanced', errors.length === 0, errors.slice(0, 6).join('; '));

  const title = html.match(/<title>([^<]*)<\/title>/i);
  check(name, 'has a <title>', !!title && title[1].trim().length > 0);
  if (title) {
    check(name, 'title is a short name (<= 40 chars)', title[1].trim().length <= 40,
      `"${title[1]}" is ${title[1].trim().length} chars`);
  }

  // --- unique ids --------------------------------------------------------
  const ids = tags.map(t => attr(t.attrs, 'id')).filter(Boolean);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  check(name, 'element ids are unique', dupes.length === 0, [...new Set(dupes)].join(', '));

  // --- internal anchors resolve -----------------------------------------
  const idSet = new Set(ids);
  const anchors = tags
    .filter(t => t.name === 'a')
    .map(t => attr(t.attrs, 'href'))
    .filter(h => h && h.startsWith('#') && h.length > 1)
    .map(h => h.slice(1));
  const dead = [...new Set(anchors.filter(a => !idSet.has(a)))];
  check(name, 'internal anchor links resolve', dead.length === 0, dead.map(d => '#' + d).join(', '));

  // --- CSS custom properties --------------------------------------------
  const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(m => m[1]));
  const used = new Set([...html.matchAll(/var\((--[a-z0-9-]+)/gi)].map(m => m[1]));
  const undef = [...used].filter(v => !defined.has(v));
  check(name, 'all CSS variables are defined', undef.length === 0, undef.join(', '));

  const unused = [...defined].filter(v => !used.has(v));
  check(name, 'no dead CSS variables', unused.length === 0, unused.join(', '));

  // --- webfonts actually loaded -----------------------------------------
  // A font-family that is not in the Google Fonts link falls back silently,
  // which is invisible in code review and obvious on screen.
  const fontLink = (html.match(/fonts\.googleapis\.com\/css2\?([^"']*)/) || [])[1] || '';
  const loaded = new Set(
    [...fontLink.matchAll(/family=([^&:]+)/g)].map(m => decodeURIComponent(m[1]).replace(/\+/g, ' '))
  );
  const GENERIC = new Set(['serif','sans-serif','monospace','system-ui','ui-monospace','georgia',
    'inherit','-apple-system','blinkmacsystemfont','segoe ui','helvetica','arial','cursive']);
  const declared = new Set();
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    for (const part of m[1].split(',')) {
      const fam = part.trim().replace(/^["']|["']$/g, '');
      if (fam && !GENERIC.has(fam.toLowerCase()) && !fam.startsWith('var(')) declared.add(fam);
    }
  }
  const missing = [...declared].filter(f => !loaded.has(f));
  check(name, 'every declared webfont is loaded', missing.length === 0, missing.join(', '));

  // --- accessibility -----------------------------------------------------
  // Inspect viewport <meta> only. The brief quotes `user-scalable=no` in prose
  // when describing the legacy site's defect, which is not the same thing.
  const viewports = tags.filter(t => t.name === 'meta' && /name\s*=\s*["']viewport["']/i.test(t.attrs));
  check(name, 'does not disable pinch zoom',
    !viewports.some(t => /user-scalable\s*=\s*no|maximum-scale/i.test(attr(t.attrs, 'content') || '')),
    'a viewport meta blocks zoom, repeating the legacy site defect');

  check(name, 'has a visible focus style', /:focus-visible/.test(css));

  // Only pages that actually move need to opt out of movement.
  const hasMotion = /transition\s*:|animation\s*:|scroll-behavior\s*:\s*smooth/.test(css);
  if (hasMotion) {
    check(name, 'respects prefers-reduced-motion', /prefers-reduced-motion/.test(css));
  }

  const svgs = tags.filter(t => t.name === 'svg');
  const undecorated = svgs.filter(t =>
    !/aria-hidden\s*=\s*"true"/i.test(t.attrs) && !/\baria-label=/i.test(t.attrs) && !/\brole=/i.test(t.attrs));
  check(name, 'decorative SVGs are hidden from screen readers',
    undecorated.length === 0, `${undecorated.length} <svg> without aria-hidden/role/aria-label`);

  const imgs = tags.filter(t => t.name === 'img');
  const noAlt = imgs.filter(t => attr(t.attrs, 'alt') === null);
  check(name, 'images have alt text', noAlt.length === 0, `${noAlt.length} <img> missing alt`);

  // --- theme safety ------------------------------------------------------
  // body must paint its own background; a transparent body borrows the host's.
  check(name, 'body sets an explicit background',
    /body\s*\{[^}]*background\s*:/.test(css.replace(/\n/g, ' ')));

  // --- wide content scrolls ---------------------------------------------
  const hasWideTable = /table\s*\{[^}]*min-width\s*:/.test(css.replace(/\n/g, ' '));
  if (hasWideTable) {
    check(name, 'wide tables have a scroll container', /overflow-x\s*:\s*auto/.test(css),
      'table has min-width but nothing declares overflow-x:auto');
  }

  // --- grid clamp regression --------------------------------------------
  // Scoped to the app shell, which is where this actually bit: a bare `1fr`
  // column takes its automatic minimum from its widest content, so a wide table
  // pushed the whole page sideways. Ordinary content grids are unaffected
  // because nothing inside them refuses to shrink.
  if (hasWideTable) {
    const shell = [...css.matchAll(/\.app\s*\{([^}]*)\}/g)]
      .map(m => m[1])
      .filter(b => /grid-template-columns/.test(b));
    const bare = shell.filter(b => {
      const v = (b.match(/grid-template-columns\s*:\s*([^;}]+)/) || [])[1] || '';
      return /(^|\s)1fr/.test(v) && !v.includes('minmax');
    });
    check(name, '.app grid columns clamp with minmax(0,1fr)', bare.length === 0,
      bare.join(' | '));
  }

  // --- layering regression (the ::after bug) ----------------------------
  // An absolutely-positioned ::after is the last child, so it paints ON TOP of
  // sibling content unless the content is given a z-index.
  const afterDecor = [...css.matchAll(/([.#][\w-]+)::after\s*\{([^}]*)\}/g)]
    .filter(m => /position\s*:\s*absolute/.test(m[2]))
    .map(m => m[1]);
  for (const base of afterDecor) {
    // Does any descendant of that base rely on position:relative with no z-index?
    const kids = [...css.matchAll(new RegExp(`\\${base}\\s+\\.[\\w-]+\\s*\\{([^}]*)\\}`, 'g'))]
      .filter(m => /position\s*:\s*relative/.test(m[1]));
    const unlayered = kids.filter(m => !/z-index/.test(m[1]));
    check(name, `content sits above ${base}::after decoration`,
      kids.length === 0 || unlayered.length === 0,
      `${unlayered.length} positioned child(ren) of ${base} lack z-index`);
  }

  // --- flex strip backgrounds -------------------------------------------
  // The real defect: a <dl> date strip is block-level, so `display:flex` lets it
  // stretch the full width and its own background shows as an empty bar beside
  // the cells. Cards inside a grid are supposed to fill their cell, so this is
  // scoped to <dl> elements rather than every flex rule.
  const dlClasses = tags
    .filter(t => t.name === 'dl')
    .map(t => attr(t.attrs, 'class'))
    .filter(Boolean)
    .flatMap(c => c.split(/\s+/));
  for (const cls of [...new Set(dlClasses)]) {
    const rule = (css.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`)) || [])[1];
    if (!rule) continue;
    if (!/display\s*:\s*flex/.test(rule)) continue;
    if (!/background\s*:/.test(rule)) continue;
    check(name, `<dl class="${cls}"> hugs its content`, false,
      'block-level flex strip leaks its background - use inline-flex');
  }

  // --- native controls are fully restyled --------------------------------
  // A bare <button> defaults to the UA's light `buttonface` background and the
  // UA font. On a dark panel that renders as a white block with unreadable
  // text, which is invisible in the source and obvious on screen.
  const controls = tags.filter(t => ['button', 'select', 'textarea', 'input'].includes(t.name));
  if (controls.length) {
    // Element-level rules (e.g. `.field input{...}`) cover every control.
    const elemRules = (css.match(/(^|[\s,>])(button|select|textarea|input)\s*\{[^}]*\}/gm) || []).join(' ');
    const globalBg = /background\s*:/.test(elemRules);
    const globalFont = /font-family\s*:/.test(elemRules);

    // Checked per element: one variant setting a background must not excuse a
    // sibling variant that does not.
    const noBg = [], noFont = [];
    for (const c of controls) {
      const cls = (attr(c.attrs, 'class') || '').split(/\s+/).filter(Boolean);
      let bg = globalBg, font = globalFont;
      for (const k of cls) {
        const rule = (css.match(new RegExp(`\\.${k}\\s*\\{([^}]*)\\}`)) || [])[1] || '';
        if (/background\s*:/.test(rule)) bg = true;
        if (/font-family\s*:/.test(rule)) font = true;
      }
      if (!bg) noBg.push(`<${c.name} class="${cls.join(' ')}"> line ${c.line}`);
      if (!font) noFont.push(`<${c.name} class="${cls.join(' ')}"> line ${c.line}`);
    }
    check(name, 'native controls set an explicit background', noBg.length === 0,
      `${noBg.length} control(s) fall back to the UA buttonface colour: ${noBg.slice(0, 3).join('; ')}`);
    check(name, 'native controls set an explicit font-family', noFont.length === 0,
      `${noFont.length} control(s) fall back to the UA font: ${noFont.slice(0, 3).join('; ')}`);
  }

  // --- canvas pages ------------------------------------------------------
  if (/<canvas/.test(html)) {
    check(name, 'canvas has a bounded retry', /tries\s*>\s*\d+/.test(js),
      'a single requestAnimationFrame retry loses the race when layout settles late');
    check(name, 'canvas repaints on resize', /ResizeObserver/.test(js));
    check(name, 'canvas guards against zero size', /if\s*\(!w\s*\|\|\s*!h\)/.test(js));
  }

  return { name, errors };
}

// ---------------------------------------------------------------------------
// canvas render test - executes each page's real script against a stub DOM
// ---------------------------------------------------------------------------

function canvasRenderTest(file, sizes, expect) {
  const name = path.basename(file);
  const html = fs.readFileSync(file, 'utf8');
  const code = scriptBlocks(html);
  if (!code.trim()) return;

  const calls = { fill: 0, stroke: 0, fillRect: 0 };
  const ctx = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'fill') return () => calls.fill++;
      if (k === 'stroke') return () => calls.stroke++;
      if (k === 'fillRect') return () => calls.fillRect++;
      if (k === 'getImageData') return () => ({ data: [0, 0, 0, 255] });
      return () => {};
    },
    set: () => true
  });

  const els = {};
  for (const [id, [w, h]] of Object.entries(sizes)) {
    els[id] = { width: 300, height: 150, clientWidth: w, clientHeight: h,
                parentElement: { clientWidth: w, clientHeight: h },
                getContext: () => ctx, style: {} };
  }

  const doc = { getElementById: id => els[id] || null, querySelector: () => null, addEventListener: () => {} };
  const win = { devicePixelRatio: 2, addEventListener: () => {},
                ResizeObserver: class { observe() {} },
                requestAnimationFrame: () => {}, setTimeout: () => {} };

  try {
    new Function('document', 'window', 'requestAnimationFrame', 'setTimeout', 'ResizeObserver', code)
      (doc, win, win.requestAnimationFrame, win.setTimeout, win.ResizeObserver);
  } catch (e) {
    check(name, 'canvas script executes', false, e.message);
    return;
  }
  check(name, 'canvas script executes', true);

  for (const id of Object.keys(sizes)) {
    const [w, h] = sizes[id];
    check(name, `#${id} is sized from its container`,
      els[id].width === w * 2 && els[id].height === h * 2,
      `got ${els[id].width}x${els[id].height}, expected ${w * 2}x${h * 2}`);
  }

  const drawn = calls.fill + calls.stroke;
  check(name, 'canvas actually draws', drawn >= expect,
    `only ${drawn} draw operations (expected >= ${expect})`);
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

const files = fs.readdirSync(MOCKUPS).filter(f => f.endsWith('.html')).sort();

console.log(`\n  3F Club mockups - ${files.length} files\n`);

for (const f of files) testFile(path.join(MOCKUPS, f));

canvasRenderTest(path.join(MOCKUPS, '02-field-guide.html'),  { topo: [1265, 775] }, 40);
canvasRenderTest(path.join(MOCKUPS, '08-still-water.html'),  { water: [1265, 700] }, 22);
canvasRenderTest(path.join(MOCKUPS, '06-blaze-timber.html'),
  { camo: [1265, 749], camoBand: [1265, 126], camoJoin: [1265, 892] }, 120);

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

if (failures.length) {
  const byFile = {};
  for (const f of failures) (byFile[f.file] ||= []).push(f);
  for (const [file, list] of Object.entries(byFile)) {
    console.log(`  ${file}`);
    for (const f of list) console.log(`    FAIL  ${f.name}${f.detail ? `\n          ${f.detail}` : ''}`);
    console.log('');
  }
}

console.log(`  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
