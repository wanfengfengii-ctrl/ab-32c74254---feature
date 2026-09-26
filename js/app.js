/*
 * 页面交互：表单录入、画布拖动、校核结果展示。
 * 所有几何计算均由 js/sweep.js 在本机完成，不发生任何网络请求。
 */
(function () {
  'use strict';

  const CV = document.getElementById('cv');
  const ctx = CV.getContext('2d');
  const W = CV.width;
  const H = CV.height;
  const TAU = Math.PI * 2;
  const TIP_HIT = 12; // 针尖手柄命中半径
  const DOT_HIT = 9; // 支点/圆心命中半径
  const EDGE_HIT = 7; // 圆周命中宽度

  const $ = (id) => document.getElementById(id);

  const defaultState = () => ({
    needles: [
      { x: 170, y: 150, len: 150, a0: 15, a1: 85, dir: 'ccw' },
      { x: 580, y: 160, len: 130, a0: 165, a1: 95, dir: 'cw' },
    ],
    circles: [{ x: 380, y: 330, r: 45 }],
    result: null,
  });

  let state = defaultState();
  let needleInputs = []; // needleInputs[i][key] -> input/select 元素
  let circleInputs = [];

  /* ---------------- 表单 ---------------- */

  function makeField(labelText, key, value, isSelect) {
    const label = document.createElement('label');
    label.textContent = labelText;
    let el;
    if (isSelect) {
      el = document.createElement('select');
      const optCcw = document.createElement('option');
      optCcw.value = 'ccw';
      optCcw.textContent = '逆时针';
      const optCw = document.createElement('option');
      optCw.value = 'cw';
      optCw.textContent = '顺时针';
      el.append(optCcw, optCw);
    } else {
      el = document.createElement('input');
      el.type = 'number';
      el.step = 'any';
    }
    el.dataset.k = key;
    el.value = value;
    label.appendChild(el);
    return { label, el };
  }

  function renderForms() {
    const nf = $('needle-forms');
    nf.innerHTML = '';
    needleInputs = state.needles.map((n, i) => {
      const fs = document.createElement('fieldset');
      fs.className = 'item';
      const legend = document.createElement('legend');
      legend.textContent = `针 #${i + 1}`;
      fs.appendChild(legend);
      const refs = {};
      [
        ['支点x', 'x'], ['支点y', 'y'], ['针长', 'len'],
        ['起始角°', 'a0'], ['终止角°', 'a1'],
      ].forEach(([text, k]) => {
        const { label, el } = makeField(text, k, n[k], false);
        refs[k] = el;
        fs.appendChild(label);
      });
      const dirField = makeField('方向', 'dir', n.dir, true);
      refs.dir = dirField.el;
      fs.appendChild(dirField.label);
      Object.values(refs).forEach((el) => {
        el.addEventListener('input', () => {
          const k = el.dataset.k;
          if (k === 'dir') n.dir = el.value;
          else n[k] = parseFloat(el.value);
          state.result = null;
          draw();
        });
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.textContent = '删除';
      del.addEventListener('click', () => {
        if (state.needles.length <= 2) return;
        state.needles.splice(i, 1);
        state.result = null;
        renderForms();
        draw();
      });
      fs.appendChild(del);
      nf.appendChild(fs);
      return refs;
    });

    const cf = $('circle-forms');
    cf.innerHTML = '';
    circleInputs = state.circles.map((c, j) => {
      const fs = document.createElement('fieldset');
      fs.className = 'item';
      const legend = document.createElement('legend');
      legend.textContent = `保护圆 #${j + 1}`;
      fs.appendChild(legend);
      const refs = {};
      [['圆心x', 'x'], ['圆心y', 'y'], ['半径', 'r']].forEach(([text, k]) => {
        const { label, el } = makeField(text, k, c[k], false);
        refs[k] = el;
        fs.appendChild(label);
      });
      Object.values(refs).forEach((el) => {
        el.addEventListener('input', () => {
          c[el.dataset.k] = parseFloat(el.value);
          state.result = null;
          draw();
        });
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.textContent = '删除';
      del.addEventListener('click', () => {
        if (state.circles.length <= 1) return;
        state.circles.splice(j, 1);
        state.result = null;
        renderForms();
        draw();
      });
      fs.appendChild(del);
      cf.appendChild(fs);
      return refs;
    });

    $('add-needle').disabled = state.needles.length >= 5;
    $('add-circle').disabled = state.circles.length >= 6;
  }

  // 拖动后把状态写回表单
  function syncFormValues() {
    state.needles.forEach((n, i) => {
      const refs = needleInputs[i];
      if (!refs) return;
      ['x', 'y', 'len', 'a0', 'a1'].forEach((k) => {
        refs[k].value = Math.round(n[k] * 100) / 100;
      });
      refs.dir.value = n.dir;
    });
    state.circles.forEach((c, j) => {
      const refs = circleInputs[j];
      if (!refs) return;
      ['x', 'y', 'r'].forEach((k) => {
        refs[k].value = Math.round(c[k] * 100) / 100;
      });
    });
  }

  /* ---------------- 画布绘制 ---------------- */

  // 数学坐标 (x 右, y 上) -> 画布坐标 (y 下)
  const cy = (y) => H - y;
  // 数学角(度, 逆时针为正) -> 画布角(弧度)
  const ca = (deg) => (-deg * Math.PI) / 180;

  function drawGrid() {
    ctx.strokeStyle = '#eee7d8';
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  function tipPos(n, deg) {
    const a = (deg * Math.PI) / 180;
    return { x: n.x + n.len * Math.cos(a), y: n.y + n.len * Math.sin(a) };
  }

  function drawNeedle(n, i, res) {
    const unsafe = res && !res.safe;
    const px = n.x;
    const py = cy(n.y);
    const a0 = ca(n.a0);
    const a1 = ca(n.a1);
    const color = unsafe ? '220,53,69' : '31,119,180';

    // 扫掠扇形（带方向：ccw 在画布上为逆时针绘制）
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, n.len, a0, a1, n.dir === 'ccw');
    ctx.closePath();
    ctx.fillStyle = `rgba(${color},0.13)`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${color},0.55)`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // 终止位置针身（虚线）
    const t1 = tipPos(n, n.a1);
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.moveTo(px, py);
    ctx.lineTo(t1.x, cy(t1.y));
    ctx.strokeStyle = `rgba(${color},0.8)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    // 起始位置针身（实线）
    const t0 = tipPos(n, n.a0);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(t0.x, cy(t0.y));
    ctx.strokeStyle = `rgb(${color})`;
    ctx.lineWidth = 3;
    ctx.stroke();

    // 首次触及位置（红色针身 + 触及点）
    if (res && res.firstTouch) {
      const ft = res.firstTouch;
      const ta = (ft.angleDeg * Math.PI) / 180;
      const tx = n.x + n.len * Math.cos(ta);
      const ty = n.y + n.len * Math.sin(ta);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(tx, cy(ty));
      ctx.strokeStyle = '#d40f22';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      const c = state.circles[ft.circle];
      if (c) {
        const hit = closestOnSeg(c.x, c.y, n.x, n.y, tx, ty);
        ctx.beginPath();
        ctx.arc(hit.x, cy(hit.y), 5, 0, TAU);
        ctx.fillStyle = '#d40f22';
        ctx.fill();
      }
    }

    // 支点与针尖手柄
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, TAU);
    ctx.fillStyle = '#333';
    ctx.fill();
    [t0, t1].forEach((t) => {
      ctx.beginPath();
      ctx.rect(t.x - 4, cy(t.y) - 4, 8, 8);
      ctx.fillStyle = `rgb(${color})`;
      ctx.fill();
    });

    ctx.fillStyle = '#333';
    ctx.font = '12px sans-serif';
    ctx.fillText(`N${i + 1}`, px + 8, py - 8);
  }

  function closestOnSeg(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return { x: ax + t * abx, y: ay + t * aby };
  }

  function drawCircle(c, j, inConflict) {
    ctx.beginPath();
    ctx.arc(c.x, cy(c.y), c.r, 0, TAU);
    ctx.fillStyle = inConflict ? 'rgba(220,53,69,0.28)' : 'rgba(40,167,69,0.15)';
    ctx.fill();
    ctx.strokeStyle = inConflict ? '#dc3545' : '#28a745';
    ctx.lineWidth = inConflict ? 2.5 : 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c.x, cy(c.y), 4, 0, TAU);
    ctx.fillStyle = inConflict ? '#dc3545' : '#28a745';
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.font = '12px sans-serif';
    ctx.fillText(`C${j + 1}`, c.x + 7, cy(c.y) - 7);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawGrid();
    const res = state.result;
    state.needles.forEach((n, i) => drawNeedle(n, i, res ? res.results[i] : null));
    state.circles.forEach((c, j) => {
      const inConflict = !!(res && res.firstConflict && res.firstConflict.circle === j);
      drawCircle(c, j, inConflict);
    });
  }

  /* ---------------- 拖动 ---------------- */

  let drag = null;

  function mousePos(e) {
    const rect = CV.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * W) / rect.width,
      y: H - ((e.clientY - rect.top) * H) / rect.height,
    };
  }

  function hitTest(m) {
    for (let i = state.needles.length - 1; i >= 0; i--) {
      const n = state.needles[i];
      const t0 = tipPos(n, n.a0);
      const t1 = tipPos(n, n.a1);
      if (Math.hypot(m.x - t0.x, m.y - t0.y) <= TIP_HIT) return { type: 'tip0', i };
      if (Math.hypot(m.x - t1.x, m.y - t1.y) <= TIP_HIT) return { type: 'tip1', i };
      if (Math.hypot(m.x - n.x, m.y - n.y) <= DOT_HIT) return { type: 'pivot', i };
    }
    for (let j = state.circles.length - 1; j >= 0; j--) {
      const c = state.circles[j];
      const d = Math.hypot(m.x - c.x, m.y - c.y);
      if (d <= DOT_HIT) return { type: 'ccenter', j };
      if (Math.abs(d - c.r) <= EDGE_HIT) return { type: 'cradius', j };
    }
    return null;
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const normDeg = (d) => ((d % 360) + 360) % 360;

  function applyDrag(m) {
    if (drag.type === 'pivot') {
      const n = state.needles[drag.i];
      n.x = clamp(m.x, 0, W);
      n.y = clamp(m.y, 0, H);
    } else if (drag.type === 'tip0' || drag.type === 'tip1') {
      const n = state.needles[drag.i];
      const ang = normDeg((Math.atan2(m.y - n.y, m.x - n.x) * 180) / Math.PI);
      n.len = clamp(Math.hypot(m.x - n.x, m.y - n.y), 10, 650);
      if (drag.type === 'tip0') n.a0 = ang;
      else n.a1 = ang;
    } else if (drag.type === 'ccenter') {
      const c = state.circles[drag.j];
      c.x = clamp(m.x, 0, W);
      c.y = clamp(m.y, 0, H);
    } else if (drag.type === 'cradius') {
      const c = state.circles[drag.j];
      c.r = clamp(Math.hypot(m.x - c.x, m.y - c.y), 5, 400);
    }
  }

  CV.addEventListener('mousedown', (e) => {
    drag = hitTest(mousePos(e));
    if (drag) e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    applyDrag(mousePos(e));
    state.result = null;
    syncFormValues();
    draw();
  });
  window.addEventListener('mouseup', () => {
    drag = null;
  });

  /* ---------------- 校核与结果 ---------------- */

  function showErrors(errors) {
    const box = $('errors');
    if (!errors.length) {
      box.innerHTML = '';
      return;
    }
    const ul = document.createElement('ul');
    errors.forEach((msg) => {
      const li = document.createElement('li');
      li.textContent = msg;
      ul.appendChild(li);
    });
    box.innerHTML = '<strong>录入有误，请修正后再校核：</strong>';
    box.appendChild(ul);
  }

  function renderResults() {
    const box = $('results');
    const res = state.result;
    box.innerHTML = '';
    if (!res) return;
    const summary = document.createElement('div');
    if (res.safe) {
      summary.className = 'ok';
      summary.textContent = '✅ 校核通过：所有针的扫掠区域与保护圆均保持安全净距。';
    } else {
      const f = res.firstConflict;
      summary.className = 'bad';
      summary.textContent =
        `⚠️ 首项冲突：针 #${f.needle + 1} 旋转至 ${f.angleDeg.toFixed(2)}° 时` +
        `首次触及保护圆 #${f.circle + 1}。`;
    }
    box.appendChild(summary);
    res.results.forEach((r, i) => {
      const line = document.createElement('div');
      if (r.safe) {
        line.className = 'ok item';
        line.textContent =
          `针 #${i + 1}：安全，最小净距 ${r.minClearance.toFixed(2)}` +
          `（相对保护圆 #${r.minClearanceCircle + 1}）`;
      } else {
        const t = r.firstTouch;
        line.className = 'bad item';
        line.textContent =
          `针 #${i + 1}：风险，首次触及角度 ${t.angleDeg.toFixed(2)}°` +
          `（保护圆 #${t.circle + 1}），最小净距 ${r.minClearance.toFixed(2)}`;
      }
      box.appendChild(line);
    });
  }

  /* ---------------- 事件绑定 ---------------- */

  $('add-needle').addEventListener('click', () => {
    if (state.needles.length >= 5) return;
    state.needles.push({
      x: 120 + state.needles.length * 90,
      y: 120,
      len: 110,
      a0: 20,
      a1: 80,
      dir: 'ccw',
    });
    state.result = null;
    renderForms();
    draw();
  });

  $('add-circle').addEventListener('click', () => {
    if (state.circles.length >= 6) return;
    state.circles.push({
      x: 150 + state.circles.length * 80,
      y: 380,
      r: 35,
    });
    state.result = null;
    renderForms();
    draw();
  });

  $('check').addEventListener('click', () => {
    const errors = window.Sweep.validate(state.needles, state.circles);
    showErrors(errors);
    if (errors.length) {
      state.result = null;
      $('results').innerHTML = '';
      draw();
      return;
    }
    state.result = window.Sweep.checkAll(state.needles, state.circles);
    renderResults();
    draw();
  });

  $('reset').addEventListener('click', () => {
    state = defaultState();
    $('errors').innerHTML = '';
    $('results').innerHTML = '';
    renderForms();
    draw();
  });

  renderForms();
  draw();
})();
