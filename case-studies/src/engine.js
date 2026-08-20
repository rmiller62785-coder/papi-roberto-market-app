/* ============================================================================
   PSA × Luna Sol — data and figures. No dependencies.

   Two rules run through every chart on this page.

   1. PROVENANCE IS DRAWN, NOT FOOTNOTED.
      Solid          = reported by a cited source.
      45° hatch      = derived by arithmetic on reported figures.
      Dotted, empty  = not published; the slot is left open and says so.

   2. NO FLATTERING AXES.
      The backlog chart is zero-based. A truncated axis would make a 15%
      reduction look like a collapse, which is the one thing a page about
      auditable numbers cannot do.

   Palette: validated with the dataviz six-checks, dark, surface #111410 —
   intake #D2602B / output #4E9BD4, all six PASS, worst adjacent pair
   ΔE 22.5 deutan, 27.2 normal. Brand lime #B8E34D is a UI accent and the
   single-series queue hue; PSA red is never a data colour.
   ========================================================================= */
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const NARROW = matchMedia('(max-width: 760px)');
const C = {
  ink:'#F4F5F2', body:'#BEC2B6', mute:'#949A90', faint:'#7E837A',
  hair:'rgba(255,255,255,.13)', hair2:'rgba(255,255,255,.07)',
  lime:'#B8E34D', intake:'#D2602B', output:'#4E9BD4', warn:'#FF8A4C',
  bg:'#0B0D0A'
};

/* ---- the published record ----------------------------------------------- */
const Q = [
  {d:'Jun 2',   iso:'2026-06-02', v:10.00, note:'All four Value tiers paused',   src:'1, 3, 9'},
  {d:'Mid-Jun', iso:'2026-06-16', v:14.00, note:'All-time record peak',          src:'4', key:'peak', fuzzy:true},
  {d:'Jun 30',  iso:'2026-06-30', v:12.00, note:'Trend turns downward',          src:'5'},
  {d:'Jul 14',  iso:'2026-07-14', v:11.00, note:'Local low',                     src:'6', key:'low'},
  {d:'Jul 28',  iso:'2026-07-28', v:12.40, note:'Rebound as held volume returns',src:'2, 8', key:'reb'},
  {d:'Aug 11',  iso:'2026-08-11', v:11.85, note:'Latest reading',                src:'2', key:'last'}
];

const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => { const e = document.createElementNS(NS, n);
  for (const k in a) if (a[k] != null) e.setAttribute(k, a[k]); return e; };
const txt = (s, a) => { const t = el('text', a); t.textContent = s; return t; };

/* Every figure carries a table of the same numbers, so the picture is never
   the only way to reach them. */
function srTable(host, caption, cols, rows){
  /* wrapped in a div: a bare <table> ignores width:1px and expands to its
     content, which pushes the document sideways */
  const box = document.createElement('div');
  box.className = 'sr-only';
  box.innerHTML = `<table><caption>${caption}</caption><thead><tr>${
    cols.map(c => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${
    rows.map(r => `<tr>${r.map((c, i) =>
      i ? `<td>${c}</td>` : `<th scope="row">${c}</th>`).join('')}</tr>`).join('')}</tbody></table>`;
  host.appendChild(box);
}
const clear = host => { while (host.firstChild) host.removeChild(host.firstChild); };

/* A figure sharing a row renders at about half width, so it takes the same
   compact geometry a phone does — otherwise its type scales down to 6px. */
const compact = host => NARROW.matches || !!host.closest('.split');

/* 45° hatch, one per colour, for everything derived */
function hatchDef(svg, id, colour){
  const defs = el('defs');
  const p = el('pattern', {id, width:'7', height:'7',
    patternUnits:'userSpaceOnUse', patternTransform:'rotate(45)'});
  p.appendChild(el('line', {x1:'0', y1:'0', x2:'0', y2:'7',
    stroke:colour, 'stroke-width':'2.4', 'stroke-opacity':'.55'}));
  defs.appendChild(p); svg.appendChild(defs);
}

/* ============================================================================
   1. The backlog. Zero-based, dated, with the pause window behind it.

   `through` truncates the series: the hero shows the climb only, so the
   reader meets the rebound where it means something rather than in the
   first screen.
   ========================================================================= */
function backlogChart(host, {through = Q.length - 1, teaser = false} = {}){
  clear(host);
  const n = NARROW.matches;
  const W = n ? 460 : 940, H = n ? 330 : 400;
  const P = n ? {t:56, r:48, b:54, l:46} : {t:64, r:116, b:52, l:60};
  const MAX = 15;
  const x = i => P.l + (i / (Q.length - 1)) * (W - P.l - P.r);
  const y = v => P.t + (1 - v / MAX) * (H - P.t - P.b);
  const FS = n ? {ax:12, an:12, lab:10.5} : {ax:11.5, an:12, lab:11.5};

  const shown = Q.slice(0, through + 1);
  const svg = el('svg', {viewBox:`0 0 ${W} ${H}`, role:'group', tabindex:'0',
    'aria-label': teaser
      ? 'PSA active grading backlog. About 10 million cards on 2 June 2026, rising to an ' +
        'all-time record of about 14 million by mid-June. The rest of the series appears ' +
        'later on this page. The axis starts at zero.'
      : 'PSA active grading backlog, June to August 2026, on a zero-based axis. ' +
        '10.0 million on 2 June, about 14.0 million at the mid-June peak, 12.0 on 30 June, ' +
        '11.0 on 14 July, 12.4 on 28 July, and 11.85 million on 11 August. ' +
        'Focus the chart and use the arrow keys to read each point.'});

  /* the pause window is a state of the world, so it is a region */
  svg.appendChild(el('rect', {x:x(0), y:P.t - 20, width:(W - P.r) - x(0),
    height:H - P.t - P.b + 20, fill:'rgba(184,227,77,.04)'}));
  svg.appendChild(el('line', {x1:x(0), y1:P.t - 20, x2:x(0), y2:H - P.b,
    stroke:'rgba(184,227,77,.4)', 'stroke-dasharray':'2 5'}));
  svg.appendChild(txt(n ? 'TIERS PAUSED FROM 2 JUN'
      : 'ALL FOUR VALUE TIERS PAUSED FROM 2 JUNE — THE RECORD DOES NOT SAY WHEN THEY REOPENED',
    {x:x(0) + 8, y:P.t - 28, fill:C.lime, 'font-size':FS.lab,
     'font-family':'var(--mono)', 'letter-spacing':'.09em'}));

  /* grid, zero-based */
  for (let g = 0; g <= MAX; g += 5){
    svg.appendChild(el('line', {x1:P.l, y1:y(g), x2:W - P.r, y2:y(g),
      stroke:g === 0 ? C.hair : C.hair2}));
    svg.appendChild(txt(g + 'M', {x:P.l - 10, y:y(g) + 4, fill:C.faint,
      'font-size':FS.ax, 'text-anchor':'end', 'font-family':'var(--mono)'}));
  }

  /* the empty region: what the reader has not been shown yet */
  if (teaser){
    const x0 = x(through);
    svg.appendChild(el('rect', {x:x0, y:P.t - 20, width:(W - P.r) - x0,
      height:H - P.t - P.b + 20, fill:'rgba(8,9,7,.72)'}));
    svg.appendChild(el('line', {x1:x0, y1:P.t - 20, x2:x0, y2:H - P.b,
      stroke:C.hair, 'stroke-dasharray':'3 5'}));
    const mx = (x0 + (W - P.r)) / 2;
    svg.appendChild(txt('THE REST OF THE SERIES', {x:mx, y:y(7.6), fill:C.faint,
      'font-size':FS.lab, 'text-anchor':'middle', 'font-family':'var(--mono)',
      'letter-spacing':'.12em'}));
    svg.appendChild(txt('IS IN THE STRESS TEST ↓', {x:mx, y:y(7.6) + 18, fill:C.faint,
      'font-size':FS.lab, 'text-anchor':'middle', 'font-family':'var(--mono)',
      'letter-spacing':'.12em'}));
  }

  const pts = shown.map((p, i) => [x(i), y(p.v)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');

  const defs = el('defs');
  const g = el('linearGradient', {id:'qfill' + (teaser ? '-t' : ''), x1:'0', y1:'0', x2:'0', y2:'1'});
  g.appendChild(el('stop', {offset:'0%', 'stop-color':C.lime, 'stop-opacity':'.11'}));
  g.appendChild(el('stop', {offset:'100%','stop-color':C.lime, 'stop-opacity':'0'}));
  defs.appendChild(g); svg.appendChild(defs);
  svg.appendChild(el('path', {d:`${d} L ${pts.at(-1)[0]} ${y(0)} L ${pts[0][0]} ${y(0)} Z`,
    fill:`url(#qfill${teaser ? '-t' : ''})`}));
  const line = el('path', {d, fill:'none', stroke:C.lime, 'stroke-width':'2.4',
    'stroke-linejoin':'round', 'stroke-linecap':'round'});
  svg.appendChild(line);

  /* the peak date is not published — say so in the mark, not in a footnote */
  const pk = Q.findIndex(p => p.key === 'peak');
  if (pk <= through){
    const half = (x(1) - x(0)) * (6 / 14);          /* ±6 days on a 14-day pitch */
    const yy = y(14.0);
    svg.appendChild(el('line', {x1:x(pk) - half, y1:yy, x2:x(pk) + half, y2:yy,
      stroke:C.mute, 'stroke-width':'1.2', 'stroke-opacity':'.85'}));
    [-1, 1].forEach(s => svg.appendChild(el('line', {x1:x(pk) + s * half, y1:yy - 4,
      x2:x(pk) + s * half, y2:yy + 4, stroke:C.mute, 'stroke-width':'1.2'})));
  }

  /* the peak reference rule — measure the recovery against it, don't eyeball it */
  if (!teaser)
    svg.appendChild(el('line', {x1:x(pk), y1:y(14), x2:W - P.r, y2:y(14),
      stroke:C.mute, 'stroke-dasharray':'2 6', 'stroke-opacity':'.5'}));

  const LBL = n ? {
    peak:['~14.0M', C.ink, -24], low:['11.0M', C.lime, 24],
    reb:['12.4M', C.warn, -20], last:['11.85M', C.ink, -20]
  } : {
    peak:['~14.0M PEAK', C.ink, -26], low:['11.0M LOW', C.lime, 26],
    reb:['12.4M REBOUND', C.warn, -22], last:['11.85M', C.ink, -22]
  };
  shown.forEach((p, i) => {
    const lb = LBL[p.key], big = !!lb;
    svg.appendChild(el('circle', {cx:x(i), cy:y(p.v), r:big ? 5 : 3.5,
      fill:p.key === 'reb' ? C.bg : (big ? C.ink : C.bg),
      stroke:p.key === 'reb' ? C.warn : C.lime, 'stroke-width':'2'}));
    if (!n || i % 2 === 0 || i === shown.length - 1)
      svg.appendChild(txt(p.d.toUpperCase(), {x:x(i), y:H - 20, fill:C.mute,
        'font-size':FS.ax, 'text-anchor':'middle', 'font-family':'var(--mono)'}));
    if (lb)
      svg.appendChild(txt(lb[0], {x:x(i), y:y(p.v) + lb[2], fill:lb[1],
        'font-size':FS.an, 'font-weight':'600', 'text-anchor':'middle',
        'font-family':'var(--mono)', 'letter-spacing':'.05em'}));
  });
  /* the whisker carries the caveat; the caption says it in words. An in-chart
     label here collides with either the banner above or the series below. */

  /* the headline delta, drawn rather than asserted */
  if (!teaser && !n){
    const xB = x(5) + 26, yP = y(14), yL = y(11.85);
    svg.appendChild(el('path', {d:`M ${xB - 7} ${yP} H ${xB} V ${yL} H ${xB - 7}`,
      fill:'none', stroke:C.mute, 'stroke-width':'1'}));
    svg.appendChild(txt('−2.15M', {x:xB + 9, y:(yP + yL) / 2 - 4, fill:C.ink,
      'font-size':'13', 'font-family':'var(--mono)', 'font-weight':'500'}));
    svg.appendChild(txt('−15.4%', {x:xB + 9, y:(yP + yL) / 2 + 12, fill:C.mute,
      'font-size':'11.5', 'font-family':'var(--mono)'}));
  }

  const cross = el('line', {y1:P.t - 20, y2:H - P.b, stroke:'rgba(255,255,255,.34)',
    'stroke-dasharray':'3 4', opacity:'0'});
  const dot = el('circle', {r:6, fill:C.lime, stroke:C.bg, 'stroke-width':'2', opacity:'0'});
  svg.append(cross, dot);
  host.appendChild(svg);

  const tip = document.createElement('div');
  tip.className = 'tip'; tip.setAttribute('role', 'status'); host.appendChild(tip);

  let cur = -1;
  const show = i => {
    cur = i; const p = shown[i], X = x(i), Y = y(p.v);
    cross.setAttribute('x1', X); cross.setAttribute('x2', X); cross.setAttribute('opacity', 1);
    dot.setAttribute('cx', X); dot.setAttribute('cy', Y); dot.setAttribute('opacity', 1);
    tip.innerHTML = `<b>${p.v.toFixed(2)}M</b> · ${p.d}<br><span>${p.note} · src ${p.src}</span>`;
    const r = svg.getBoundingClientRect(), h = host.getBoundingClientRect();
    tip.style.left = (r.left - h.left + X / W * r.width) + 'px';
    tip.style.top  = (r.top  - h.top  + Y / H * r.height) + 'px';
    tip.classList.add('on');
  };
  const hide = () => { cur = -1; tip.classList.remove('on');
    cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); };
  const nearest = e => {
    const r = svg.getBoundingClientRect(), mx = (e.clientX - r.left) / r.width * W;
    let b = 0, bd = 1e9;
    shown.forEach((_, i) => { const dd = Math.abs(x(i) - mx); if (dd < bd){ bd = dd; b = i; } });
    show(b);
  };
  svg.addEventListener('pointermove', nearest);
  svg.addEventListener('pointerdown', nearest);
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', e => {
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowLeft'){ e.preventDefault();
      show(cur < 0 ? 0 : Math.min(shown.length - 1, Math.max(0, cur + (k === 'ArrowRight' ? 1 : -1)))); }
    else if (k === 'Home'){ e.preventDefault(); show(0); }
    else if (k === 'End'){ e.preventDefault(); show(shown.length - 1); }
    else if (k === 'Escape'){ hide(); }
  });

  srTable(host, teaser
    ? 'PSA active grading backlog to the mid-June peak'
    : 'PSA active grading backlog, June to August 2026',
    ['Reading', 'Date', 'Cards in queue', 'Note', 'Source'],
    shown.map(p => [p.d, p.fuzzy ? p.iso + ' (assumed; date not published)' : p.iso,
      p.v.toFixed(2) + ' million', p.note, p.src]));

  if (!RM.matches){
    const L = line.getTotalLength();
    line.style.strokeDasharray = L; line.style.strokeDashoffset = L;
    requestAnimationFrame(() => {
      line.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(.33,0,.1,1) .15s';
      line.style.strokeDashoffset = 0;
    });
  }
}

/* ============================================================================
   2. Waterfall, 14.0 → 11.85. The one derivation in the record that closes
   exactly, which is why it is worth drawing.
   ========================================================================= */
const STEPS = [
  {l:'Peak',   v:14.00, anchor:true},
  {l:'Jun 30', d:-2.00}, {l:'Jul 14', d:-1.00},
  {l:'Jul 28', d:+1.40}, {l:'Aug 11', d:-0.55},
  {l:'Latest', v:11.85, anchor:true}
];

function waterfallChart(host){
  clear(host);
  const n = compact(host);
  const W = n ? 440 : 620, H = n ? 300 : 340;
  const P = {t:48, r:14, b:58, l:42}, MAX = 15;
  const bw = (W - P.l - P.r) / STEPS.length;
  const y = v => P.t + (1 - v / MAX) * (H - P.t - P.b);
  const FS = n ? 10 : 11;

  const svg = el('svg', {viewBox:`0 0 ${W} ${H}`, role:'img',
    'aria-label':'Waterfall from the 14.0 million mid-June peak to 11.85 million on 11 August: ' +
      'down 2.00, down 1.00, up 1.40, down 0.55. The steps sum to minus 2.15 million exactly.'});
  svg.appendChild(el('line', {x1:P.l, y1:y(0), x2:W - P.r, y2:y(0), stroke:C.hair}));

  let run = 0;
  STEPS.forEach((s, i) => {
    const x0 = P.l + i * bw + bw * .18, w = bw * .64;
    if (s.anchor){
      run = s.v;
      svg.appendChild(el('rect', {x:x0, y:y(s.v), width:w, height:y(0) - y(s.v), rx:'3',
        fill:'rgba(244,245,242,.15)', stroke:'rgba(244,245,242,.32)'}));
      svg.appendChild(txt(s.v.toFixed(2), {x:x0 + w / 2, y:y(s.v) - 10, fill:C.ink,
        'font-size':n ? '13' : '14', 'text-anchor':'middle',
        'font-family':'var(--disp)', 'font-weight':'600'}));
    } else {
      const from = run, to = run + s.d; run = to;
      const top = y(Math.max(from, to)), bot = y(Math.min(from, to)), up = s.d > 0;
      svg.appendChild(el('rect', {x:x0, y:top, width:w, height:Math.max(2, bot - top), rx:'2',
        fill:up ? C.intake : C.lime, 'fill-opacity':up ? '.92' : '.72'}));
      svg.appendChild(txt((up ? '+' : '') + s.d.toFixed(2),
        {x:x0 + w / 2, y:up ? top - 8 : bot + 15, fill:up ? C.warn : C.lime,
         'font-size':'12', 'text-anchor':'middle', 'font-family':'var(--mono)', 'font-weight':'500'}));
      svg.appendChild(el('line', {x1:x0 + w, y1:y(to), x2:x0 + bw, y2:y(to),
        stroke:C.hair2, 'stroke-dasharray':'2 3'}));
    }
    svg.appendChild(txt(s.l.toUpperCase(), {x:x0 + w / 2, y:H - 32, fill:C.mute,
      'font-size':FS, 'text-anchor':'middle', 'font-family':'var(--mono)'}));
  });

  svg.appendChild(txt(n ? 'Σ = −2.15M · CLOSES EXACTLY'
      : 'Σ = −2.15M · THE ONLY DERIVATION HERE THAT CLOSES EXACTLY',
    {x:P.l, y:H - 12, fill:C.faint, 'font-size':FS, 'font-family':'var(--mono)',
     'letter-spacing':'.08em'}));

  host.appendChild(svg);
  srTable(host, 'Backlog waterfall from the mid-June peak to 11 August',
    ['Step', 'Change', 'Level after'],
    [['Mid-June peak', '—', '14.00 million'],
     ['to 30 June', '−2.00 million', '12.00 million'],
     ['to 14 July', '−1.00 million', '11.00 million'],
     ['to 28 July', '+1.40 million', '12.40 million'],
     ['to 11 August', '−0.55 million', '11.85 million'],
     ['Net', '−2.15 million, or −15.4 per cent', '11.85 million']]);
}

/* ============================================================================
   3. Monthly output. The empty July-2025 slot is the point: there is exactly
   one year-over-year pair in the record, and inventing a second would be
   the easiest lie on the page.
   ========================================================================= */
const OUT = [
  {d:'Jun 2025', v:1.44, kind:'derived', note:'implied by the +74% year-over-year figure: 2.50 ÷ 1.74'},
  {d:'Jul 2025', v:null, kind:'none',    note:'not published — no July year-over-year pair exists'},
  {d:'May 2026', v:2.07, kind:'derived', note:'implied by the +21% month-over-month figure: 2.50 ÷ 1.21'},
  {d:'Jun 2026', v:2.50, kind:'sourced', note:'reported record [7]'},
  {d:'Jul 2026', v:2.75, kind:'floor',   note:'floor only: reported as more than 10% above June [2]'}
];

function outputChart(host){
  clear(host);
  const n = compact(host);
  const W = n ? 460 : 900, H = n ? 320 : 340;
  const P = {t:62, r:14, b:58, l:38}, MAX = 3.2;
  const bw = (W - P.l - P.r) / OUT.length;
  const y = v => P.t + (1 - v / MAX) * (H - P.t - P.b);

  const svg = el('svg', {viewBox:`0 0 ${W} ${H}`, role:'img',
    'aria-label':'Monthly cards graded. June 2025 about 1.44 million, derived. July 2025 not ' +
      'published. May 2026 about 2.07 million, derived. June 2026 2.50 million, reported. ' +
      'July 2026 at least 2.75 million, a floor rather than a value.'});
  hatchDef(svg, 'h-out', C.output);
  svg.appendChild(el('line', {x1:P.l, y1:y(0), x2:W - P.r, y2:y(0), stroke:C.hair}));

  OUT.forEach((o, i) => {
    const x0 = P.l + i * bw + bw * .19, w = bw * .62;
    if (o.kind === 'none'){
      svg.appendChild(el('rect', {x:x0, y:y(1.25), width:w, height:y(0) - y(1.25), rx:'3',
        fill:'none', stroke:C.faint, 'stroke-dasharray':'3 4'}));
      svg.appendChild(txt('NOT', {x:x0 + w / 2, y:y(0.78), fill:C.faint, 'font-size':'10',
        'text-anchor':'middle', 'font-family':'var(--mono)', 'letter-spacing':'.1em'}));
      svg.appendChild(txt('PUBLISHED', {x:x0 + w / 2, y:y(0.78) + 13, fill:C.faint,
        'font-size':'10', 'text-anchor':'middle', 'font-family':'var(--mono)', 'letter-spacing':'.1em'}));
    } else {
      const solid = o.kind === 'sourced';
      svg.appendChild(el('rect', {x:x0, y:y(o.v), width:w, height:y(0) - y(o.v), rx:'3',
        fill:solid ? C.output : 'url(#h-out)', stroke:solid ? 'none' : C.output,
        'stroke-width':solid ? 0 : 1.2, 'stroke-opacity':solid ? 1 : .7}));
      if (o.kind === 'floor')                        /* open top: a bound, not a value */
        svg.appendChild(el('path', {d:`M ${x0} ${y(o.v)} l ${w / 2} -9 l ${w / 2} 9`,
          fill:'none', stroke:C.output, 'stroke-width':'1.6'}));
      svg.appendChild(txt((o.kind === 'floor' ? '≥' : o.kind === 'derived' ? '~' : '') +
        o.v.toFixed(2) + 'M',
        {x:x0 + w / 2, y:y(o.v) - (o.kind === 'floor' ? 18 : 11), fill:C.ink,
         'font-size':n ? '13' : '15', 'text-anchor':'middle',
         'font-family':'var(--disp)', 'font-weight':'600'}));
    }
    svg.appendChild(txt(o.d.toUpperCase(), {x:x0 + w / 2, y:H - 34, fill:C.mute,
      'font-size':n ? '10' : '11', 'text-anchor':'middle', 'font-family':'var(--mono)'}));
    svg.appendChild(txt({sourced:'REPORTED', derived:'DERIVED', floor:'FLOOR', none:'NO DATA'}[o.kind],
      {x:x0 + w / 2, y:H - 18, fill:o.kind === 'sourced' ? C.mute : C.faint,
       'font-size':'9.5', 'text-anchor':'middle', 'font-family':'var(--mono)', 'letter-spacing':'.1em'}));
  });

  /* the one legitimate year-over-year pair in the record */
  const xa = P.l + bw * .5, xb = P.l + 3 * bw + bw * .5;
  svg.appendChild(el('path', {d:`M ${xa} ${P.t - 22} V ${P.t - 32} H ${xb} V ${P.t - 22}`,
    fill:'none', stroke:C.mute, 'stroke-width':'1'}));
  svg.appendChild(txt('+74% YEAR ON YEAR · +1.06M CARDS', {x:(xa + xb) / 2, y:P.t - 40,
    fill:C.body, 'font-size':n ? '10' : '11.5', 'text-anchor':'middle',
    'font-family':'var(--mono)', 'letter-spacing':'.07em'}));

  host.appendChild(svg);
  srTable(host, 'Monthly cards graded, with the basis of each figure',
    ['Month', 'Cards graded', 'Basis'],
    OUT.map(o => [o.d, o.v == null ? 'not published'
      : (o.kind === 'floor' ? 'at least ' : o.kind === 'derived' ? 'about ' : '') +
        o.v.toFixed(2) + ' million', o.note]));
}

/* ============================================================================
   4. Months of cover — the queue divided by the last completed month of
   output. The queue fell 15%; the time to clear it fell 36%.
   ========================================================================= */
function coverChart(host){
  clear(host);
  const n = compact(host);
  const W = n ? 440 : 620, H = 216;
  const P = {l:56, r:56}, MAX = 8;
  const x = v => P.l + (v / MAX) * (W - P.l - P.r);
  const yb = 84, A = 6.78, B = 4.31;

  const svg = el('svg', {viewBox:`0 0 ${W} ${H}`, role:'img',
    'aria-label':'Months of cover, the queue divided by the last completed month of output, ' +
      'fell from about 6.78 months at the mid-June peak to at most 4.31 months on 11 August — ' +
      'a reduction of about 36 per cent.'});

  for (let g = 0; g <= MAX; g += 2){
    svg.appendChild(el('line', {x1:x(g), y1:yb - 30, x2:x(g), y2:yb + 74,
      stroke:g === 0 ? C.hair : C.hair2}));
    svg.appendChild(txt(g + ' mo', {x:x(g), y:yb + 94, fill:C.faint, 'font-size':'10.5',
      'text-anchor':'middle', 'font-family':'var(--mono)'}));
  }
  svg.appendChild(el('line', {x1:x(B), y1:yb, x2:x(A), y2:yb, stroke:C.lime, 'stroke-width':'4'}));
  svg.appendChild(el('circle', {cx:x(A), cy:yb, r:'8', fill:C.bg, stroke:C.mute, 'stroke-width':'2'}));
  svg.appendChild(el('circle', {cx:x(B), cy:yb, r:'8', fill:C.lime, stroke:C.bg, 'stroke-width':'2'}));

  const pin = (v, label, sub, up, col) => {
    const yy = up ? yb - 24 : yb + 32;
    svg.appendChild(txt(label, {x:x(v), y:yy, fill:col, 'font-size':n ? '15' : '17',
      'text-anchor':'middle', 'font-family':'var(--disp)', 'font-weight':'600'}));
    svg.appendChild(txt(sub, {x:x(v), y:yy + (up ? -15 : 15), fill:C.mute, 'font-size':'9.5',
      'text-anchor':'middle', 'font-family':'var(--mono)', 'letter-spacing':'.07em'}));
  };
  pin(A, '6.78 mo', 'AT THE PEAK · 14.00 ÷ 2.07', true, C.body);
  pin(B, '≤4.31 mo', 'AT AUG 11 · 11.85 ÷ 2.75', false, C.ink);
  svg.appendChild(txt('−36%', {x:(x(A) + x(B)) / 2, y:yb - 14, fill:C.lime, 'font-size':'12.5',
    'text-anchor':'middle', 'font-family':'var(--mono)', 'font-weight':'500'}));

  host.appendChild(svg);
  srTable(host, 'Months of cover at the last completed month of output',
    ['State', 'Queue', 'Divided by', 'Months of cover'],
    [['Mid-June peak', '14.00 million', 'May 2026 output, about 2.07 million (derived)', 'about 6.78 months'],
     ['11 August', '11.85 million', 'July 2026 output, at least 2.75 million (a floor)', 'at most 4.31 months'],
     ['Change', 'queue × 0.85', 'monthly output × 1.33', 'about −36 per cent']]);
}

/* ============================================================================
   5. The rebound fortnight. Both bars are bounds, and the chart says so.
   ========================================================================= */
function fortnightChart(host){
  clear(host);
  const n = compact(host);
  const W = n ? 460 : 780, H = n ? 230 : 220;
  const P = {t:16, r:n ? 82 : 130, l:n ? 104 : 168}, MAX = 2.95;
  const bh = n ? 36 : 46, gap = n ? 18 : 24;
  const x = v => P.l + (v / MAX) * (W - P.l - P.r);

  const svg = el('svg', {viewBox:`0 0 ${W} ${H}`, role:'img',
    'aria-label':'Between 14 and 28 July 2026 the queue rose 1.40 million while cards were being ' +
      'graded at a record rate, so at least 2.64 million cards arrived against at least 1.24 ' +
      'million graded — about 2.1 in for every 1 out at the published July floor.'});
  hatchDef(svg, 'h-in', C.intake);
  const d2 = el('defs');
  const p2 = el('pattern', {id:'h-outb', width:'7', height:'7',
    patternUnits:'userSpaceOnUse', patternTransform:'rotate(45)'});
  p2.appendChild(el('line', {x1:'0', y1:'0', x2:'0', y2:'7', stroke:C.output,
    'stroke-width':'2.4', 'stroke-opacity':'.55'}));
  d2.appendChild(p2); svg.appendChild(d2);

  [{k:'Cards arriving', v:2.64, c:C.intake, p:'url(#h-in)'},
   {k:'Cards graded',   v:1.24, c:C.output, p:'url(#h-outb)'}].forEach((f, i) => {
    const yv = P.t + i * (bh + gap);
    svg.appendChild(txt(f.k, {x:P.l - 14, y:yv + bh / 2 + 5, fill:C.body,
      'font-size':n ? '12.5' : '14', 'text-anchor':'end', 'font-family':'var(--sans)'}));
    svg.appendChild(el('rect', {x:P.l, y:yv, width:Math.max(2, x(f.v) - P.l), height:bh, rx:'3',
      fill:f.p, stroke:f.c, 'stroke-width':'1.2', 'stroke-opacity':'.75'}));
    svg.appendChild(el('path', {d:`M ${x(f.v)} ${yv} l 9 ${bh / 2} l -9 ${bh / 2}`,
      fill:'none', stroke:f.c, 'stroke-width':'1.6'}));   /* open end: a floor */
    svg.appendChild(txt('≥' + f.v.toFixed(2) + 'M', {x:x(f.v) + 16, y:yv + bh / 2 + 6, fill:C.ink,
      'font-size':n ? '15' : '18', 'font-family':'var(--disp)', 'font-weight':'600'}));
  });

  const lx = 14, yr = P.t + 2 * (bh + gap) + 2;
  svg.appendChild(el('line', {x1:lx, y1:yr, x2:W - 14, y2:yr, stroke:C.hair2}));
  svg.appendChild(txt('≈ 2.1 IN FOR EVERY 1 OUT, AT THE PUBLISHED JULY FLOOR',
    {x:lx, y:yr + 22, fill:C.ink, 'font-size':n ? '10' : '12',
     'font-family':'var(--mono)', 'letter-spacing':'.06em'}));
  svg.appendChild(txt('BOTH BARS ARE LOWER BOUNDS — JULY OUTPUT IS REPORTED AS A MINIMUM',
    {x:lx, y:yr + 40, fill:C.faint, 'font-size':n ? '9' : '10.5',
     'font-family':'var(--mono)', 'letter-spacing':'.06em'}));

  host.appendChild(svg);
  srTable(host, 'Implied arrivals against output, 14 to 28 July 2026',
    ['Measure', 'Cards', 'How it is derived'],
    [['Cards arriving', 'at least 2.64 million', 'the queue rose 1.40M plus at least 1.24M graded'],
     ['Cards graded', 'at least 1.24 million', 'the July floor of 2.75M spread across 31 days, times 14'],
     ['Ratio', 'about 2.1 to 1', 'at the published July floor; a higher July output lowers the ratio']]);
}

/* ============================================================================
   6. The card field — 1,400 marks at the mid-June peak, one per 10,000 cards.
   The 215 lime marks are the 2.15M cleared by 11 August. Two paths, not
   1,400 nodes.
   ========================================================================= */
function cardField(host){
  clear(host);
  const COLS = 50, ROWS = 28, CW = 4, CH = 6, GX = 6, GY = 8, CLEARED = 215;
  const W = COLS * GX - (GX - CW), H = ROWS * GY - (GY - CH);
  let a = '', b = '';
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++){
      const i = r * COLS + c, seg = `M${c * GX} ${r * GY}h${CW}v${CH}h${-CW}z`;
      if (i < CLEARED) a += seg; else b += seg;
    }
  const svg = el('svg', {viewBox:`0 0 ${W} ${H}`, 'aria-hidden':'true',
    preserveAspectRatio:'xMidYMid meet'});
  svg.appendChild(el('path', {d:b, fill:'rgba(244,245,242,.17)'}));
  svg.appendChild(el('path', {d:a, fill:C.lime, 'fill-opacity':'.9'}));
  host.appendChild(svg);
}

/* ============================================================================
   7. Where the flow caps. The constraint is drawn narrow because that is
   the finding, and the held volume sits outside the counted queue.
   ========================================================================= */
function flowDiagram(host){
  clear(host);
  const W = 900, H = 280;
  const svg = el('svg', {viewBox:`0 0 ${W} ${H}`, role:'img',
    'aria-label':'A pipeline diagram. Submissions enter the counted queue of 11.85 million cards. ' +
      'Flow then passes through a narrow binding constraint before reaching graded output and ' +
      'release. Held volume from the paused tiers sits outside the counted queue entirely, so it ' +
      'never appears in the published number.'});
  const defs = el('defs');
  const g = el('linearGradient', {id:'flow', x1:'0', x2:'1'});
  [['0%', C.intake, '.6'], ['50%', C.intake, '.26'],
   ['60%', C.output, '.28'], ['100%', C.output, '.6']]
    .forEach(([o, c, op]) => g.appendChild(el('stop', {offset:o, 'stop-color':c, 'stop-opacity':op})));
  defs.appendChild(g); svg.appendChild(defs);

  const my = 118, wide = 46, thin = 13;
  svg.appendChild(el('path', {fill:'url(#flow)', d:
    `M 40 ${my - wide} C 300 ${my - wide}, 380 ${my - thin}, 452 ${my - thin}
     L 500 ${my - thin} C 570 ${my - thin}, 620 ${my - 26}, 858 ${my - 26}
     L 858 ${my + 26} C 620 ${my + 26}, 570 ${my + thin}, 500 ${my + thin}
     L 452 ${my + thin} C 380 ${my + thin}, 300 ${my + wide}, 40 ${my + wide} Z`}));

  svg.appendChild(el('rect', {x:452, y:my - 54, width:48, height:108, rx:'4',
    fill:'rgba(11,13,10,.92)', stroke:C.lime, 'stroke-width':'1.5'}));
  for (let i = -1; i <= 1; i++)
    svg.appendChild(el('line', {x1:462, y1:my + i * 12, x2:490, y2:my + i * 12,
      stroke:C.lime, 'stroke-width':'1.5', 'stroke-opacity':'.6'}));

  const cap = (x, y, t, s, col, an) => {
    svg.appendChild(txt(t, {x, y, fill:col || C.ink, 'font-size':'14',
      'text-anchor':an || 'middle', 'font-family':'var(--disp)', 'font-weight':'600'}));
    if (s) svg.appendChild(txt(s, {x, y:y + 17, fill:C.mute, 'font-size':'10.5',
      'text-anchor':an || 'middle', 'font-family':'var(--mono)', 'letter-spacing':'.08em'}));
  };
  cap(40,  42,  'Submissions in',    '≈2.1 IN PER 1 OUT AT THE REBOUND', C.ink, 'start');
  cap(250, 210, 'The counted queue', '11.85M CARDS · AUG 11');
  cap(476, 38,  'The constraint',    'WHERE THE RATE IS SET', C.lime);
  cap(690, 210, 'Graded output',     '≥2.75M IN JULY');
  cap(858, 42,  'Released',          'BACK TO SUBMITTERS', C.ink, 'end');

  /* the volume that never enters the number */
  svg.appendChild(el('rect', {x:96, y:my + 78, width:236, height:46, rx:'4',
    fill:'none', stroke:C.intake, 'stroke-dasharray':'4 4'}));
  svg.appendChild(txt('HELD VOLUME — PAUSED TIERS', {x:214, y:my + 100, fill:C.intake,
    'font-size':'11', 'text-anchor':'middle', 'font-family':'var(--mono)', 'letter-spacing':'.08em'}));
  svg.appendChild(txt('NEVER ENTERS THE COUNT', {x:214, y:my + 116, fill:C.faint,
    'font-size':'10', 'text-anchor':'middle', 'font-family':'var(--mono)', 'letter-spacing':'.08em'}));
  svg.appendChild(el('path', {d:`M 214 ${my + 78} V ${my + 54}`, stroke:C.intake,
    'stroke-width':'1.2', 'stroke-dasharray':'3 4'}));

  host.appendChild(svg);
}

/* ============================================================================
   8. The weekly operating loop.
   ========================================================================= */
const SIGNALS = [
  {n:'Backlog level',       q:'How large is the queue?',      a:'Recovery review'},
  {n:'Velocity',            q:'Burning faster than intake?',  a:'Escalate the constraint'},
  {n:'Aging',               q:'Is old inventory piling up?',  a:'Targeted action'},
  {n:'Held volume',         q:'Is the recovery sustainable?', a:'Root-cause review'},
  {n:'Constraint capacity', q:'Where is throughput capped?',  a:'Resource intervention'}
];

function loopTable(host){
  srTable(host, 'The five weekly signals and their defined responses',
    ['Signal', 'Question it answers', 'Response when the threshold is breached'],
    SIGNALS.map(s => [s.n, s.q, s.a]));
}

function governanceLoop(host){
  clear(host);
  if (NARROW.matches){                      /* a ring is unreadable at 390px */
    const ol = document.createElement('ol');
    ol.className = 'siglist';
    ol.innerHTML = SIGNALS.map((s, i) => `<li><span class="n">${i + 1}</span><span>` +
      `<b>${s.n}</b><em>${s.q}</em><span class="act">→ ${s.a}</span></span></li>`).join('');
    host.appendChild(ol);
    loopTable(host);
    return;
  }
  const W = 820, H = 430, cx = 410, cy = 212, R = 128;
  const svg = el('svg', {viewBox:`0 0 ${W} ${H}`, role:'img',
    'aria-label':'A five-signal weekly loop. Backlog level, velocity, aging, held volume and ' +
      'constraint capacity are each measured, compared with a threshold, mapped to a defined ' +
      'response, and re-measured the following week.'});
  svg.appendChild(el('circle', {cx, cy, r:R, fill:'none', stroke:C.hair, 'stroke-dasharray':'2 6'}));
  svg.appendChild(txt('Measure → compare', {x:cx, y:cy - 6, fill:C.ink, 'font-size':'15',
    'text-anchor':'middle', 'font-family':'var(--disp)', 'font-weight':'600'}));
  svg.appendChild(txt('with threshold → act', {x:cx, y:cy + 14, fill:C.ink, 'font-size':'15',
    'text-anchor':'middle', 'font-family':'var(--disp)', 'font-weight':'600'}));
  svg.appendChild(txt('EVERY WEEK', {x:cx, y:cy + 36, fill:C.lime, 'font-size':'10.5',
    'text-anchor':'middle', 'font-family':'var(--mono)', 'letter-spacing':'.14em'}));

  SIGNALS.forEach((s, i) => {
    const ang = -Math.PI / 2 + (i / SIGNALS.length) * Math.PI * 2;
    const px = cx + Math.cos(ang) * R, py = cy + Math.sin(ang) * R;
    const right = Math.cos(ang) > .05, left = Math.cos(ang) < -.05;
    const an = right ? 'start' : left ? 'end' : 'middle';
    const ox = right ? 22 : left ? -22 : 0;
    const oy = Math.sin(ang) < -.6 ? -32 : Math.sin(ang) > .6 ? 30 : -8;
    svg.appendChild(el('circle', {cx:px, cy:py, r:'7', fill:C.bg, stroke:C.lime, 'stroke-width':'2'}));
    svg.appendChild(txt(i + 1, {x:px, y:py + 3.5, fill:C.lime, 'font-size':'9',
      'text-anchor':'middle', 'font-family':'var(--mono)'}));
    svg.appendChild(txt(s.n, {x:px + ox, y:py + oy, fill:C.ink, 'font-size':'14.5',
      'text-anchor':an, 'font-family':'var(--disp)', 'font-weight':'600'}));
    svg.appendChild(txt(s.q, {x:px + ox, y:py + oy + 17, fill:C.mute, 'font-size':'12',
      'text-anchor':an, 'font-family':'var(--sans)'}));
    svg.appendChild(txt('→ ' + s.a.toUpperCase(), {x:px + ox, y:py + oy + 33, fill:C.lime,
      'font-size':'10', 'text-anchor':an, 'font-family':'var(--mono)', 'letter-spacing':'.09em'}));
  });
  host.appendChild(svg);
  loopTable(host);
}

/* ============================================================================
   9. Page behaviour.
   ========================================================================= */
/* The markup already carries the final value, so this only ever animates up to
   what is already on screen — a reader with JS off or motion suppressed sees the
   number, never a placeholder zero. */
function runCount(node){
  if (node.dataset.done || RM.matches) return; node.dataset.done = '1';
  const to = +node.dataset.to, dec = +(node.dataset.dec || 0);
  const t0 = performance.now(), dur = 1000;
  (function tick(t){
    const p = Math.min((t - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
    node.textContent = (to * e).toFixed(dec);
    if (p < 1) requestAnimationFrame(tick);
  })(t0);
}

const FIGURES = [
  ['cardfield',     cardField],
  ['fig-climb',     h => backlogChart(h, {through:1, teaser:true})],
  ['fig-flow',      flowDiagram],
  ['fig-loop',      governanceLoop],
  ['fig-backlog',   h => backlogChart(h)],
  ['fig-waterfall', waterfallChart],
  ['fig-fortnight', fortnightChart],
  ['fig-output',    outputChart],
  ['fig-cover',     coverChart]
];
const drawAll = () => FIGURES.forEach(([id, fn]) => {
  const h = document.getElementById(id); if (h) fn(h);
});

function boot(){
  drawAll();

  /* charts switch geometry rather than just scaling, so redraw across the break */
  let wasNarrow = NARROW.matches, wasSplit = matchMedia('(max-width: 1180px)').matches, t;
  addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const SPLIT = matchMedia('(max-width: 1180px)').matches;
      if (NARROW.matches !== wasNarrow || SPLIT !== wasSplit){
        wasNarrow = NARROW.matches; wasSplit = SPLIT; drawAll();
      }
    }, 200);
  }, {passive:true});

  const reveal = new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting){
      e.target.classList.add('in');
      e.target.querySelectorAll('.count').forEach(runCount);
      reveal.unobserve(e.target);
    }
  }, {threshold:.1, rootMargin:'0px 0px -5% 0px'});
  document.querySelectorAll('.rv:not(.in)').forEach(nd => reveal.observe(nd));
  document.querySelectorAll('.rv.in .count').forEach(runCount);

  /* rail state: whichever section owns the most viewport */
  const links = [...document.querySelectorAll('.rail nav a')];
  const byId = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
  const ratio = new Map();
  const spy = new IntersectionObserver(es => {
    for (const e of es) ratio.set(e.target.id, e.intersectionRatio);
    let best = null, bv = 0;
    for (const [id, v] of ratio) if (v > bv){ bv = v; best = id; }
    links.forEach(a => a.removeAttribute('aria-current'));
    if (best && byId.has(best)) byId.get(best).setAttribute('aria-current', 'true');
  }, {threshold:[0, .1, .25, .5, .75, 1], rootMargin:'-8% 0px -40% 0px'});
  byId.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });

  const bar = document.getElementById('prog');
  let queued = false;
  addEventListener('scroll', () => {
    if (queued) return; queued = true;
    requestAnimationFrame(() => {
      const h = document.documentElement;
      bar.style.width = (h.scrollTop / (h.scrollHeight - h.clientHeight) * 100) + '%';
      queued = false;
    });
  }, {passive:true});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
