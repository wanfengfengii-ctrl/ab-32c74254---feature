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
    // 分步注胶：默认关闭，旧草稿行为不变；order 为针索引的执行排列
    stepwise: { enabled: false, minClearance: 5, order: [0, 1] },
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
        // 删除针后维护执行顺序：移除该针并平移后续索引
        state.stepwise.order = state.stepwise.order
          .filter((idx) => idx !== i)
          .map((idx) => (idx > i ? idx - 1 : idx));
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

    renderStepwise();
  }

  /* ---------------- 分步注胶：开关、净距与执行顺序拖动 ---------------- */

  let orderDragPos = null; // 正在拖动的顺序项位置

  function renderStepwise() {
    $('stepwise-enabled').checked = state.stepwise.enabled;
    $('stepwise-config').hidden = !state.stepwise.enabled;
    $('min-clearance').value = state.stepwise.minClearance;
    renderOrderList();
  }

  function renderOrderList() {
    const ol = $('order-list');
    ol.innerHTML = '';
    state.stepwise.order.forEach((ni, k) => {
      const li = document.createElement('li');
      li.draggable = true;
      li.textContent = `第 ${k + 1} 步：针 #${ni + 1}`;
      li.addEventListener('dragstart', (e) => {
        orderDragPos = k;
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(k));
      });
      li.addEventListener('dragend', () => {
        orderDragPos = null;
        ol.querySelectorAll('li').forEach((el) => el.classList.remove('dragging', 'drop-before', 'drop-after'));
      });
      li.addEventListener('dragover', (e) => {
        if (orderDragPos === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = li.getBoundingClientRect();
        const after = e.clientY - rect.top > rect.height / 2;
        li.classList.toggle('drop-before', !after);
        li.classList.toggle('drop-after', after);
      });
      li.addEventListener('dragleave', () => {
        li.classList.remove('drop-before', 'drop-after');
      });
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        if (orderDragPos === null) return;
        const rect = li.getBoundingClientRect();
        moveOrder(orderDragPos, k, e.clientY - rect.top > rect.height / 2);
      });
      ol.appendChild(li);
    });
    // 拖到列表空白处 = 移到末尾（属性赋值避免重复绑定）
    ol.ondragover = (e) => {
      if (orderDragPos !== null && e.target === ol) e.preventDefault();
    };
    ol.ondrop = (e) => {
      if (orderDragPos === null || e.target !== ol) return;
      e.preventDefault();
      moveOrder(orderDragPos, state.stepwise.order.length - 1, true);
    };
  }

  // 把 from 位置的针移动到 to 位置之前/之后，顺序修改作废旧结果
  function moveOrder(from, to, after) {
    const order = state.stepwise.order;
    let insertAt = after ? to + 1 : to;
    const [moved] = order.splice(from, 1);
    if (from < insertAt) insertAt -= 1;
    order.splice(insertAt, 0, moved);
    state.result = null;
    renderOrderList();
    draw();
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

  function drawNeedle(n, i, res, stepNo) {
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
    ctx.fillText(stepNo ? `N${i + 1}·第${stepNo}步` : `N${i + 1}`, px + 8, py - 8);
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

  // 分步注胶首项针间风险：叠加显示该步活动针越界姿态与停驻针姿态
  function drawStepConflict(res) {
    const f = res.firstNeedleConflict;
    const stepOf = [];
    res.order.forEach((ni, k) => {
      stepOf[ni] = k;
    });
    const parked = state.needles[f.parked];
    drawNeedlePose(parked, stepOf[f.parked] < f.step ? parked.a1 : parked.a0, '#e8590c');
    const active = state.needles[f.active];
    drawNeedlePose(active, f.angleDeg, '#d40f22');
    const t = tipPos(active, f.angleDeg);
    ctx.fillStyle = '#d40f22';
    ctx.font = '12px sans-serif';
    ctx.fillText(`第${f.step + 1}步越界 ${f.angleDeg.toFixed(2)}°`, t.x + 6, cy(t.y) - 6);
  }

  function drawNeedlePose(n, deg, color) {
    const t = tipPos(n, deg);
    ctx.beginPath();
    ctx.moveTo(n.x, cy(n.y));
    ctx.lineTo(t.x, cy(t.y));
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.stroke();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawGrid();
    const res = state.result;
    const stepwiseMode = res && res.mode === 'stepwise';
    // 分步模式下的颜料圆结论取自 res.circle，与旧草稿的 res 结构对齐
    const circleRes = res ? (stepwiseMode ? res.circle : res) : null;
    const stepOf = {};
    if (state.stepwise.enabled) {
      state.stepwise.order.forEach((ni, k) => {
        stepOf[ni] = k + 1;
      });
    }
    state.needles.forEach((n, i) => drawNeedle(n, i, circleRes ? circleRes.results[i] : null, stepOf[i]));
    state.circles.forEach((c, j) => {
      const inConflict = !!(circleRes && circleRes.firstConflict && circleRes.firstConflict.circle === j);
      drawCircle(c, j, inConflict);
    });
    if (stepwiseMode && res.firstNeedleConflict) drawStepConflict(res);
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

  // 颜料保护圆逐针结果行（旧草稿与分步模式共用）
  function appendCircleLines(box, circleRes) {
    circleRes.results.forEach((r, i) => {
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

  function appendBanner(box, className, text) {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    box.appendChild(div);
  }

  function appendSubhead(box, text) {
    const div = document.createElement('div');
    div.className = 'subhead';
    div.textContent = text;
    box.appendChild(div);
  }

  // 分步注胶结果：颜料圆结论 + 逐步针间净距结论
  function renderStepwiseResults(box, res) {
    if (res.safe) {
      appendBanner(
        box,
        'ok',
        `✅ 分步注胶校核通过：颜料保护圆与针间净距（限值 ${res.limit}）均安全。`
      );
    } else {
      const f = res.firstNeedleConflict;
      if (f) {
        appendBanner(
          box,
          'bad',
          `⚠️ 首项针间风险：第 ${f.step + 1} 步，针 #${f.active + 1} 旋转至 ${f.angleDeg.toFixed(2)}° 时，` +
            `与停驻针 #${f.parked + 1} 的间距首次触及最小针间净距限值 ${res.limit}。`
        );
      }
      if (!res.circle.safe) {
        const cf = res.circle.firstConflict;
        appendBanner(
          box,
          'bad',
          `⚠️ 首项颜料圆冲突：针 #${cf.needle + 1} 旋转至 ${cf.angleDeg.toFixed(2)}° 时` +
            `首次触及保护圆 #${cf.circle + 1}。`
        );
      }
    }
    appendSubhead(box, '颜料保护圆校核');
    appendCircleLines(box, res.circle);
    appendSubhead(box, `分步针间净距校核（限值 ${res.limit}）`);
    res.steps.forEach((st) => {
      const line = document.createElement('div');
      if (st.safe) {
        line.className = 'ok item';
        line.textContent =
          `第 ${st.step + 1} 步（针 #${st.active + 1} 注胶）：安全，` +
          `最小针间净距 ${st.minClearance.toFixed(2)}（相对停驻针 #${st.minClearanceParked + 1}）`;
        box.appendChild(line);
      } else {
        line.className = 'bad item';
        line.textContent = `第 ${st.step + 1} 步（针 #${st.active + 1} 注胶）：风险`;
        box.appendChild(line);
        st.pairs
          .filter((p) => p.firstViolation)
          .forEach((p) => {
            const sub = document.createElement('div');
            sub.className = 'bad item sub';
            sub.textContent =
              `↳ 停驻针 #${p.parked + 1}：旋转至 ${p.firstViolation.angleDeg.toFixed(2)}° 首次越界` +
              `（净距 ${p.minClearance.toFixed(2)}，限值 ${res.limit}）`;
            box.appendChild(sub);
          });
      }
    });
  }

  function renderResults() {
    const box = $('results');
    const res = state.result;
    box.innerHTML = '';
    if (!res) return;
    if (res.mode === 'stepwise') {
      renderStepwiseResults(box, res);
      return;
    }
    if (res.safe) {
      appendBanner(box, 'ok', '✅ 校核通过：所有针的扫掠区域与保护圆均保持安全净距。');
    } else {
      const f = res.firstConflict;
      appendBanner(
        box,
        'bad',
        `⚠️ 首项冲突：针 #${f.needle + 1} 旋转至 ${f.angleDeg.toFixed(2)}° 时` +
          `首次触及保护圆 #${f.circle + 1}。`
      );
    }
    appendCircleLines(box, res);
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
    state.stepwise.order.push(state.needles.length - 1); // 新针默认排在最后执行
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
    const sw = state.stepwise;
    const errors = window.Sweep.validate(state.needles, state.circles);
    if (sw.enabled) {
      errors.push(
        ...window.Sweep.validateStepwise(state.needles, {
          order: sw.order,
          minNeedleClearance: sw.minClearance,
        })
      );
    }
    showErrors(errors);
    if (errors.length) {
      state.result = null;
      $('results').innerHTML = '';
      draw();
      return;
    }
    state.result = sw.enabled
      ? window.Sweep.checkStepwise(state.needles, state.circles, {
          order: sw.order.slice(),
          minNeedleClearance: sw.minClearance,
        })
      : window.Sweep.checkAll(state.needles, state.circles);
    renderResults();
    draw();
  });

  // 分步注胶：开关、净距限值修改均作废旧结果
  $('stepwise-enabled').addEventListener('change', (e) => {
    state.stepwise.enabled = e.target.checked;
    state.result = null;
    renderStepwise();
    draw();
  });
  $('min-clearance').addEventListener('input', (e) => {
    state.stepwise.minClearance = parseFloat(e.target.value);
    state.result = null;
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
