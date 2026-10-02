/* Analysis controller: the original canvas renderer remains usable offline. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { C, compile, finite } = window.ComplexMath;
  const app = window.ComplexApp;
  let action = 'local', connected = false, revision = 0, controller = null;
  let localResult = null, markers = [], cuts = [], pathCurves = [], seriesCircle = null;
  const labels = { zero: 'Zero', 'zero-candidate': 'Zero candidate', pole: 'Pole', removable: 'Removable', regular: 'Regular', essential: 'Essential', branch: 'Branch point', 'branch-candidate': 'Branch candidate', critical: 'Critical', unknown: 'Unclassified' };
  const format = (x) => Number.isFinite(x) ? Number(x.toPrecision(9)).toString() : 'Undetermined';
  const complex = (z) => z ? `${format(z.re)} ${z.im < 0 ? '−' : '+'} ${format(Math.abs(z.im))}i` : 'Undefined';
  function element(tag, text, className) {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (className) e.className = className;
    return e;
  }
  function card(title, text, kind = '') {
    const box = element('section', undefined, `analysis-card ${kind}`);
    box.append(element('h3', title));
    if (text !== undefined) box.append(element('p', text));
    $('analysis-results').append(box);
    return box;
  }
  function row(parent, label, value) {
    const r = element('div', undefined, 'result-row');
    r.append(element('span', label), element('code', value ?? 'Undetermined'));
    parent.append(r);
  }
  function read(id, min = -1e8, max = 1e8) {
    const value = $(id).value.trim(), n = Number(value);
    if (!value || !Number.isFinite(n) || n < min || n > max) throw Error(`${$(id).closest('label')?.firstChild?.textContent || id}: enter a finite value from ${min} to ${max}`);
    return n;
  }
  function context() {
    const state = app.snapshot();
    if (document.activeElement !== $('analysis-real')) $('analysis-real').value = state.probe.re;
    if (document.activeElement !== $('analysis-imag')) $('analysis-imag').value = state.probe.im;
    return state;
  }
  function invalidate(message = '') {
    revision++;
    controller?.abort(); controller = null;
    $('analysis-run').disabled = !connected;
    $('analysis-run').textContent = 'Calculate';
    localResult = null; markers = []; cuts = []; seriesCircle = null;
    $('analysis-results').replaceChildren(...(message ? [element('div', message, 'result-empty')] : []));
    app.redraw();
  }
  async function connect() {
    if (location.protocol === 'file:') {
      $('engine-status').textContent = 'Offline · Run start.ps1';
      $('engine-status').classList.add('offline'); $('analysis-run').disabled = true;
      return;
    }
    try {
      const r = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
      const data = await r.json();
      if (!data.ok) throw Error();
      connected = true;
      $('engine-status').textContent = `Connected`;
      $('engine-status').classList.remove('offline');
      $('analysis-run').disabled = false;
    } catch {
      connected = false;
      $('engine-status').textContent = 'Offline · Run start.ps1';
      $('engine-status').classList.add('offline'); $('analysis-run').disabled = true;
    }
  }
  function choose(next) {
    action = next;
    document.querySelectorAll('[data-analysis]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.analysis === next)));
    document.querySelectorAll('[data-for]').forEach((box) => { box.hidden = box.dataset.for !== next; });
    $('analysis-tolerance').closest('label').hidden = !['integral', 'residue'].includes(next);
    $('target-controls').scrollTop = 0;
    pathCurves = [];
    invalidate('');
    context();
  }
  function show(open) {
    $('analysis-panel').hidden = !open;
    $('output-view').hidden = open;
    $('view-toggle').setAttribute('aria-pressed', String(!open));
    $('analysis-toggle').setAttribute('aria-pressed', String(open));
    $('analysis-toggle').setAttribute('aria-expanded', String(open));
    if (open) { app.prepareAnalysis(); context(); connect(); }
    else controller?.abort();
    $('target-controls').scrollTop = 0;
    app.redraw();
  }
  $('analysis-toggle').addEventListener('click', () => show(true));
  $('view-toggle').addEventListener('click', () => show(false));
  document.querySelectorAll('[data-analysis]').forEach((button) => button.addEventListener('click', () => choose(button.dataset.analysis)));
  window.addEventListener('complex-probe', () => { context(); invalidate(); });
  window.addEventListener('complex-expression', () => { context(); pathCurves = []; invalidate(); });
  $('analysis-panel').querySelectorAll('input, select, textarea').forEach((input) => input.addEventListener('input', () => {
    if (input.id === 'show-linear') return app.redraw();
    pathCurves = []; invalidate();
  }));
  for (const id of ['analysis-real', 'analysis-imag']) $(id).addEventListener('input', () => {
    try { app.setProbe(C(read('analysis-real'), read('analysis-imag'))); }
    catch (error) { displayError(error); }
  });
  $('use-view').addEventListener('click', () => {
    const b = app.snapshot().bounds;
    for (const key of ['left', 'right', 'bottom', 'top']) $(`region-${key}`).value = b[key];
    invalidate();
  });
  $('path-type').addEventListener('change', () => {
    const type = $('path-type').value;
    document.querySelectorAll('[data-path]').forEach((box) => { box.hidden = box.dataset.path !== (type === 'circle' || type === 'parametric' ? type : 'vertices'); });
  });
  $('pick-vertex').addEventListener('click', () => {
    const p = app.snapshot().probe;
    $('path-vertices').value += `\n${p.re}, ${p.im}`;
    invalidate();
  });
  function path() {
    const type = $('path-type').value;
    pathCurves = [];
    let spec;
    if (type === 'circle') {
      const center = C(read('path-re'), read('path-im')), radius = read('path-radius', 1e-6, 1e6);
      const start = read('path-start', -3600, 3600), end = read('path-end', -3600, 3600);
      if (start === end) throw Error('Start and end angles must differ');
      spec = { type, center, radius, start, end };
      pathCurves.push((t) => { const a = (start+(end-start)*t)*Math.PI/180; return C(center.re+radius*Math.cos(a), center.im+radius*Math.sin(a)); });
    } else if (type === 'parametric') {
      const fn = compile($('path-expression').value.replace(/\bt\b/g, 'z'));
      const t0 = read('path-t0', -1e4, 1e4), t1 = read('path-t1', -1e4, 1e4);
      if (t0 === t1) throw Error('Parameter interval must be nonzero');
      spec = { type, ast: fn.ast, t0, t1 };
      pathCurves.push((t) => fn(C(t0+(t1-t0)*t)));
    } else {
      const points = $('path-vertices').value.trim().split(/\n+/).map((line) => {
        const values = line.trim().split(/[,，\s]+/);
        if (values.length !== 2 || values.some((v) => !Number.isFinite(Number(v)) || Math.abs(Number(v)) > 1e8)) throw Error('Invalid vertex: expected Re, Im');
        return C(Number(values[0]), Number(values[1]));
      });
      if (points.length < 2 || points.length > 32) throw Error('Enter 2–32 vertices');
      spec = { type, points };
      const ps = [...points];
      if (type === 'polygon' && (ps[0].re !== ps.at(-1).re || ps[0].im !== ps.at(-1).im)) ps.push(ps[0]);
      for (let i = 1; i < ps.length; i++) {
        const a = ps[i-1], b = ps[i];
        if (a.re === b.re && a.im === b.im) throw Error('Adjacent vertices must differ');
        pathCurves.push((t) => C(a.re+(b.re-a.re)*t, a.im+(b.im-a.im)*t));
      }
    }
    app.redraw();
    return spec;
  }
  function displayError(error) {
    $('analysis-results').replaceChildren();
    card('Calculation failed', error.message, 'result-warning');
  }
  $('preview-path').addEventListener('click', () => { try { path(); } catch (error) { displayError(error); } });
  $('apply-branch').addEventListener('click', () => {
    try {
      const branch = read('branch-index', -100, 100), angle = read('branch-angle', -180, 180);
      if (!Number.isInteger(branch)) throw Error('Branch index must be an integer');
      app.setBranch({ branch, cutAngle: angle*Math.PI/180 });
      $('branch-preview').textContent = `Arg ∈ (${angle-360}°, ${angle}°] · k = ${branch}`;
      if (connected) run();
    } catch (error) { displayError(error); }
  });
  function request() {
    const point = C(read('analysis-real'), read('analysis-imag'));
    const previous = app.snapshot().probe;
    if (point.re !== previous.re || point.im !== previous.im) app.setProbe(point);
    const state = context();
    const data = { action, ast: state.fn.ast, point: state.probe,
      options: { branch: state.branchOptions.branch, cutDegrees: state.branchOptions.cutAngle*180/Math.PI },
      tolerance: Number($('analysis-tolerance').value) };
    if (action === 'landmarks') data.bounds = Object.fromEntries(['left', 'right', 'bottom', 'top'].map((key) => [key, read(`region-${key}`)]));
    if (action === 'integral') data.path = path();
    if (action === 'residue') data.radius = read('residue-radius', 1e-6, 1e6);
    if (action === 'series') {
      data.order = read('series-order', 1, 16);
      if (!Number.isInteger(data.order)) throw Error('Order must be an integer');
      data.radius = read('series-radius', 1e-6, 1e6);
    }
    return data;
  }
  async function run() {
    if (!connected) return;
    let payload;
    try { payload = request(); } catch (error) { displayError(error); return; }
    controller?.abort(); controller = new AbortController();
    const current = ++revision;
    $('analysis-run').disabled = true;
    $('analysis-run').textContent = 'Calculating…';
    $('analysis-results').replaceChildren(element('div', 'Calculating…', 'result-empty'));
    try {
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
      const data = await response.json();
      if (current !== revision) return;
      if (!data.ok) throw Error(data.error || 'Calculation failed');
      render(data.result, payload);
    } catch (error) {
      if (error.name !== 'AbortError' && current === revision) displayError(error);
    } finally {
      if (current === revision) { $('analysis-run').disabled = false; $('analysis-run').textContent = 'Calculate'; }
    }
  }
  $('analysis-run').addEventListener('click', run);
  function render(result, payload) {
    $('analysis-results').replaceChildren();
    if (action === 'local') {
      localResult = { ...result, point: payload.point };
      const status = card('Analyticity', result.status, result.holomorphic ? 'result-good' : 'result-warning');
      if (result.holomorphic) {
        const d = card('Derivatives');
        row(d, 'f′(z)', result.derivative); row(d, 'f′(z₀)', result.d1);
        row(d, 'f″(z)', result.second); row(d, 'f″(z₀)', result.d2);
        row(d, 'Scale |f′|', result.scale); row(d, 'Rotation (rad)', result.rotation);
        row(d, 'Linearization', result.linear);
        if (result.critical) d.append(element('p', 'Critical point · f′ = 0', 'result-warning'));
      }
      row(status, 'f(z₀)', result.value);
      const w = card('Wirtinger derivatives');
      row(w, '∂f/∂z', result.wirtinger_z.formula); row(w, 'At z₀', result.wirtinger_z.value);
      row(w, '∂f/∂z̄', result.wirtinger_bar.formula); row(w, 'At z₀', result.wirtinger_bar.value);
      const c = card('Cauchy–Riemann');
      for (const [key, value] of Object.entries(result.partials)) row(c, key, value.value);
      row(c, 'uₓ − vᵧ', result.cr[0]); row(c, 'vₓ + uᵧ', result.cr[1]);
    } else if (action === 'landmarks') {
      markers = result.items;
      card('Search results', `${markers.length} markers · ${result.status || (result.complete ? 'Complete' : 'Partial')}`);
      for (const item of markers) {
        const c = card(`${labels[item.kind]}${item.order ? ` · order ${item.order}` : ''}`);
        row(c, item.exact ? 'Exact' : 'Approximate', item.position);
        if (item.residual) row(c, '|f(z)|', item.residual);
        const b = element('button', 'Set probe', 'secondary-button');
        b.type = 'button'; b.addEventListener('click', () => app.setProbe(item.point)); c.append(b);
      }
    } else if (action === 'residue') {
      const c = card('Residue');
      row(c, 'Res(f, z₀)', result.symbolic); row(c, 'Value', result.numeric);
      row(c, 'Type', `${labels[result.kind]}${result.order ? ` · order ${result.order}` : ''}`);
      const v = card('Contour check', result.converged ? 'Converged' : 'Not converged', result.converged ? 'result-good' : 'result-warning');
      row(v, '∮ f dz / (2πi)', complex(result.circleEstimate));
      row(v, 'Difference', format(result.difference)); row(v, 'Estimated error', format(result.error));
      const a = payload.point, r = payload.radius;
      pathCurves = [(t) => C(a.re+r*Math.cos(2*Math.PI*t), a.im+r*Math.sin(2*Math.PI*t))];
    } else if (action === 'integral') {
      const c = card('Integral', result.converged ? 'Converged' : 'Not converged', result.converged ? 'result-good' : 'result-warning');
      row(c, '∫γ f(z) dz', result.numeric); row(c, 'Estimated error', format(result.error));
      if (result.theorem) {
        const t = card('Residue theorem');
        row(t, '2πi Σ n(γ,a) Res(f,a)', complex(result.theorem.value)); row(t, 'Difference', format(result.theorem.difference));
        for (const item of result.theorem.contributions) row(t, `a = ${item.point} · winding ${item.winding}`, `Res = ${item.residue}`);
      }
      const cumulative = card('Cumulative integral');
      result.cumulative.forEach((value, i) => row(cumulative, `${Math.round((i+1)/result.cumulative.length*100)}%`, complex(value)));
    } else if (action === 'series') {
      const c = card('Expansion', result.formula);
      row(c, 'Principal part (truncated)', result.principal.replace(/\bh\b/g, '(z − z₀)'));
      const region = card('Convergence', result.radiusKnown ? undefined : 'Radius unverified', result.radiusKnown ? 'result-good' : 'result-warning');
      if (result.radiusKnown) row(region, 'Region', `${result.inner > 0 ? result.inner+' < ' : ''}|z − z₀| < ${result.outer ?? '∞'}${result.punctured && result.inner === 0 ? ', z ≠ z₀' : ''}`);
      row(region, 'Sample radius', format(result.sampleRadius)); row(region, `Max error (${result.validSamples} samples)`, result.maxSampleError === null ? 'Unavailable' : format(result.maxSampleError));
      const coefficients = card('Coefficients aₙ');
      result.coefficients.forEach((item) => row(coefficients, `n = ${item.power}`, item.exact));
      seriesCircle = { point: payload.point, radius: result.sampleRadius, inner: result.inner, outer: result.outer, known: result.radiusKnown };
    } else if (action === 'branches') {
      cuts = result.cuts;
      const c = card('Branch'); row(c, 'Arg range', result.range); row(c, 'f(z₀)', result.value);
      if (result.issue) c.append(element('p', result.issue, 'result-warning'));
      for (const cut of cuts) {
        row(c, `Argument ${cut.argument}`, typeof cut.angle === 'number' ? `Cut ${cut.angle}°` : `${cut.angle} principal cut`);
        if (cut.origin) {
          const jump = card(`Cut samples · ${cut.argument} · ε = 10⁻⁶`);
          row(jump, '+i side', cut.sidePlus); row(jump, '−i side', cut.sideMinus); row(jump, 'Difference', cut.jump);
        }
      }
      if (!cuts.length) c.append(element('p', 'No branch cuts'));
    }
    const scroll = $('target-controls');
    scroll.scrollTop += $('analysis-results').getBoundingClientRect().top - scroll.getBoundingClientRect().top - $('sidebar-tabs').offsetHeight - 8;
    app.redraw();
  }
  function arrow(plot, a, b, pixel, color) {
    if (!finite(a) || !finite(b)) return;
    const p = pixel(plot, a), q = pixel(plot, b), ctx = plot.ctx;
    if (Math.hypot(q.x-p.x, q.y-p.y) < .01 || Math.abs(q.x) > 1e5 || Math.abs(q.y) > 1e5) return;
    const angle = Math.atan2(q.y-p.y, q.x-p.x);
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-8, -4); ctx.lineTo(-8, 4); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.restore();
  }
  window.ComplexLab = { draw({ source, target, pixel, drawCurve, state }) {
    if ($('analysis-panel').hidden) return;
    const sample = (curve) => Array.from({ length: 257 }, (_, i) => curve(i/256));
    for (const curve of pathCurves) {
      drawCurve(source, sample(curve), { color: '#a46d31', circle: false });
      drawCurve(target, window.ComplexGeometry.sampleCurve(curve, state.fn, target.scale, { budget: 2048 }), { color: '#a46d31', circle: false });
      for (const t of [.25, .75]) { arrow(source, curve(t-.01), curve(t), pixel, '#a46d31'); arrow(target, state.fn(curve(t-.01)), state.fn(curve(t)), pixel, '#a46d31'); }
    }
    if (localResult?.holomorphic && localResult.derivativePoint && $('show-linear').checked) {
      const a = localResult.point, d = localResult.derivativePoint, fa = state.fn(a);
      const radius = state.sourceView.span*.07;
      const curve = (t) => C(a.re+radius*Math.cos(t*2*Math.PI), a.im+radius*Math.sin(t*2*Math.PI));
      const linear = (z) => C(fa.re+d.re*(z.re-a.re)-d.im*(z.im-a.im), fa.im+d.im*(z.re-a.re)+d.re*(z.im-a.im));
      drawCurve(source, sample(curve), { color: '#7061a3', circle: true });
      drawCurve(target, sample((t) => state.fn(curve(t))), { color: '#286451', circle: false });
      drawCurve(target, sample((t) => linear(curve(t))), { color: '#7061a3', circle: true });
    }
    if (seriesCircle) {
      const { point: a, radius: r } = seriesCircle;
      drawCurve(source, sample((t) => C(a.re+r*Math.cos(2*Math.PI*t), a.im+r*Math.sin(2*Math.PI*t))), { color: '#7061a3', circle: true });
      if (seriesCircle.known) for (const radius of [seriesCircle.inner, seriesCircle.outer]) {
        if (radius > 0 && radius < state.sourceView.span*50) drawCurve(source, sample((t) => C(a.re+radius*Math.cos(2*Math.PI*t), a.im+radius*Math.sin(2*Math.PI*t))), { color: '#bd7940', circle: true });
      }
    }
    for (const cut of cuts) if (cut.origin && cut.direction) {
      const a = cut.origin, d = cut.direction, norm = Math.hypot(d.re, d.im);
      const length = (state.sourceView.span+Math.hypot(state.sourceView.re-a.re, state.sourceView.im-a.im))*10;
      drawCurve(source, [a, C(a.re+d.re/norm*length, a.im+d.im/norm*length)], { color: '#bd7940', circle: true });
    }
    for (const item of markers) {
      const p = pixel(source, item.point), ctx = source.ctx;
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 2*Math.PI);
      ctx.fillStyle = item.kind === 'zero' ? '#368f8b' : item.kind === 'critical' ? '#7061a3' : '#b55c69'; ctx.fill();
      ctx.font = '11px Segoe UI'; ctx.fillText(`${labels[item.kind]}${item.order || ''}`, p.x+8, p.y-7);
    }
  } };
  choose('local');
})();
