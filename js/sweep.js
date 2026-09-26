/*
 * 注胶针扫掠几何模块。
 * 把每根针从起始角沿指定方向旋转到终止角所扫过的区域视为带方向的圆扇形，
 * 精确计算保护圆与该扇形的最小净距以及针身首次触及保护圆的角度。
 * 纯函数、无 DOM 依赖：浏览器中挂在 window.Sweep，Node 中通过 module.exports 导出。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.Sweep = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const EPS = 1e-9; // 几何计算容差
  const SAFE_EPS = 1e-7; // 净距判定容差：<= 此值视为相切/相交，即不安全

  const deg2rad = (d) => (d * Math.PI) / 180;
  const rad2deg = (r) => (r * 180) / Math.PI;

  // 归一化到 [0, 2π)
  function normAngle(a) {
    let w = a % TAU;
    if (w < 0) w += TAU;
    return w;
  }

  // 归一化到 (-π, π]
  function wrapPi(a) {
    const w = normAngle(a);
    return w > Math.PI ? w - TAU : w;
  }

  // 从 a0 沿 dir 转到 a1 的扫掠幅度（弧度，范围 (0, 2π)）
  function sweepAmount(a0, a1, dir) {
    return normAngle(dir === 'cw' ? a0 - a1 : a1 - a0);
  }

  // 角 ang 是否落在从 a0 沿 dir 旋转 amount 的扫掠范围内
  function angleInSweep(a0, amount, dir, ang) {
    const off = dir === 'cw' ? normAngle(a0 - ang) : normAngle(ang - a0);
    return off <= amount + EPS;
  }

  // 从 a0 沿 dir 前进 offset 后的角度
  function advance(a0, offset, dir) {
    return dir === 'cw' ? a0 - offset : a0 + offset;
  }

  function pointSegDist(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby;
    let t = 0;
    if (len2 > 0) t = ((px - ax) * abx + (py - ay) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
  }

  /*
   * 圆心到扫掠扇形区域（含边界）的最短距离。
   * n: { x, y, len, a0, dir }（弧度制），amount 为扫掠幅度。
   */
  function distToSector(c, n, amount) {
    const dx = c.x - n.x;
    const dy = c.y - n.y;
    const d = Math.hypot(dx, dy);
    if (d < EPS) return 0; // 圆心即支点，位于扇形内部
    const phi = Math.atan2(dy, dx);
    if (angleInSweep(n.a0, amount, n.dir, phi)) {
      return Math.max(0, d - n.len); // 圆心角向落在扇形内：在径向内部为 0，否则超出弧长的部分
    }
    // 角向落在扇形外：最近点必在两条径向边界线段之一上
    const a1 = advance(n.a0, amount, n.dir);
    return Math.min(
      pointSegDist(c.x, c.y, n.x, n.y, n.x + n.len * Math.cos(n.a0), n.y + n.len * Math.sin(n.a0)),
      pointSegDist(c.x, c.y, n.x, n.y, n.x + n.len * Math.cos(a1), n.y + n.len * Math.sin(a1))
    );
  }

  /*
   * 针身（从支点出发、长 len 的线段）绕支点旋转时，触及圆 (d, r) 的角度区间半宽。
   * d 为圆心到支点距离。返回 null 表示任何角度都不会触及。
   * 推导：触及区间是以圆心方位角 φ 为中心、半宽 γ 的连续区间 [φ-γ, φ+γ]。
   *  - 若切点 sqrt(d²-r²) 落在针长内，边界由切线决定：γ = asin(r/d)；
   *  - 否则边界由针尖掠过圆周决定：γ = acos((d²+len²-r²)/(2·d·len))。
   */
  function touchHalfWidth(d, r, len) {
    if (d <= r + EPS) return Math.PI; // 支点被圆覆盖或相切：任何角度都触及
    if (d - r > len + EPS) return null; // 圆整体在针长范围之外
    const tangentLen = Math.sqrt(Math.max(0, d * d - r * r));
    if (tangentLen <= len + EPS) return Math.asin(Math.min(1, r / d));
    const cosBeta = (d * d + len * len - r * r) / (2 * d * len);
    if (cosBeta > 1 + EPS) return null; // 针尖也无法够到圆
    return Math.acos(Math.max(-1, Math.min(1, cosBeta)));
  }

  /*
   * 针从 a0 沿 dir 扫过 amount 的过程中，首次触及圆 c 的位置。
   * 返回 { offset, angle }（弧度，offset 为沿旋转方向转过的量），不触及返回 null。
   */
  function firstTouchVsCircle(n, amount, c) {
    const dx = c.x - n.x;
    const dy = c.y - n.y;
    const d = Math.hypot(dx, dy);
    const gamma = touchHalfWidth(d, c.r, n.len);
    if (gamma === null) return null;
    const phi = Math.atan2(dy, dx);
    // 起始角已处于触及区间内
    if (Math.abs(wrapPi(phi - n.a0)) <= gamma + EPS) return { offset: 0, angle: n.a0 };
    // 沿旋转方向首先遇到的区间边界（ccw 为 φ-γ，cw 为 φ+γ）
    const boundary = n.dir === 'cw' ? phi + gamma : phi - gamma;
    const off = n.dir === 'cw' ? normAngle(n.a0 - boundary) : normAngle(boundary - n.a0);
    if (off > amount + EPS) return null;
    const clamped = Math.min(off, amount);
    return { offset: clamped, angle: advance(n.a0, clamped, n.dir) };
  }

  // 单根针对全部保护圆的分析（内部使用弧度制针）
  function analyzeNeedle(n, circles) {
    const amount = sweepAmount(n.a0, n.a1, n.dir);
    let minClearance = Infinity;
    let minClearanceCircle = -1;
    let firstTouch = null;
    circles.forEach((c, i) => {
      const clearance = distToSector(c, n, amount) - c.r;
      if (clearance < minClearance - EPS) {
        minClearance = clearance;
        minClearanceCircle = i;
      }
      const t = firstTouchVsCircle(n, amount, c);
      if (t && (!firstTouch || t.offset < firstTouch.offset - EPS)) {
        firstTouch = { offset: t.offset, angle: t.angle, circle: i };
      }
    });
    return {
      safe: minClearance > SAFE_EPS,
      minClearance,
      minClearanceCircle,
      firstTouch,
    };
  }

  function toRadianNeedle(n) {
    return {
      x: n.x,
      y: n.y,
      len: n.len,
      a0: deg2rad(n.a0),
      a1: deg2rad(n.a1),
      dir: n.dir === 'cw' ? 'cw' : 'ccw',
    };
  }

  /* ================ 分步注胶：活动针 vs 停驻针身的连续净距校核 ================ */

  // 线段相交判定（含共线重叠与端点接触）
  function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const cross = (ox, oy, px, py, qx, qy) => (px - ox) * (qy - oy) - (py - oy) * (qx - ox);
    const d1 = cross(cx, cy, dx, dy, ax, ay);
    const d2 = cross(cx, cy, dx, dy, bx, by);
    const d3 = cross(ax, ay, bx, by, cx, cy);
    const d4 = cross(ax, ay, bx, by, dx, dy);
    if (
      ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
      ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))
    ) {
      return true;
    }
    const onSeg = (px, py, qx, qy, rx, ry) =>
      Math.min(px, qx) - EPS <= rx && rx <= Math.max(px, qx) + EPS &&
      Math.min(py, qy) - EPS <= ry && ry <= Math.max(py, qy) + EPS;
    if (Math.abs(d1) <= EPS && onSeg(cx, cy, dx, dy, ax, ay)) return true;
    if (Math.abs(d2) <= EPS && onSeg(cx, cy, dx, dy, bx, by)) return true;
    if (Math.abs(d3) <= EPS && onSeg(ax, ay, bx, by, cx, cy)) return true;
    if (Math.abs(d4) <= EPS && onSeg(ax, ay, bx, by, dx, dy)) return true;
    return false;
  }

  // 线段 AB 与线段 CD 的最短距离（相交为 0）
  function segSegDist(ax, ay, bx, by, cx, cy, dx, dy) {
    if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
    return Math.min(
      pointSegDist(ax, ay, cx, cy, dx, dy),
      pointSegDist(bx, by, cx, cy, dx, dy),
      pointSegDist(cx, cy, ax, ay, bx, by),
      pointSegDist(dx, dy, ax, ay, bx, by)
    );
  }

  /*
   * 活动针（支点 P、针长 len）与停驻线段 AB 的净距 ≤ c 的针角集合。
   * 净距 ≤ c ⟺ 针身与「AB 膨胀 c 的胶囊体 ∩ 针尖圆盘」相交；该交集为凸集，
   * 从胶囊外的支点看，命中方向构成单个连续角区间。
   * 返回 { lo, hi }（从 lo 逆时针到 hi 为越界区间）、'all'（任意角越界）或 null。
   * 方法：枚举全部候选边界角（端点圆盘切线、针尖圆与端点圆/两侧偏移线的交点），
   * 对候选角及相邻候选角之间弧段的中点逐一做精确线段间距判定，拼出越界区间。
   * 候选集是真实区间边界的超集，多余候选只会细分弧段，不影响判定结果。
   */
  function violationInterval(P, len, A, B, c) {
    if (pointSegDist(P.x, P.y, A.x, A.y, B.x, B.y) <= c + SAFE_EPS) return 'all';
    const cands = [];
    // 端点圆盘 (A,c)、(B,c) 的切线角（P 在胶囊外 ⇒ |PQ| > c 恒成立）
    for (const Q of [A, B]) {
      const dx = Q.x - P.x;
      const dy = Q.y - P.y;
      const d = Math.hypot(dx, dy);
      const phi = Math.atan2(dy, dx);
      const g = Math.asin(Math.min(1, c / d));
      cands.push(phi - g, phi + g);
    }
    // 针尖圆 (P,len) 与端点圆 (A,c)、(B,c) 的交点角
    for (const Q of [A, B]) {
      const dx = Q.x - P.x;
      const dy = Q.y - P.y;
      const d = Math.hypot(dx, dy);
      if (d < EPS) continue;
      if (d > len + c + EPS || d < Math.abs(len - c) - EPS) continue;
      const a = (d * d + len * len - c * c) / (2 * d);
      const h2 = len * len - a * a;
      if (h2 < -EPS) continue;
      const h = Math.sqrt(Math.max(0, h2));
      const ux = dx / d;
      const uy = dy / d;
      const mx = P.x + a * ux;
      const my = P.y + a * uy;
      cands.push(Math.atan2(my + h * ux - P.y, mx - h * uy - P.x));
      cands.push(Math.atan2(my - h * ux - P.y, mx + h * uy - P.x));
    }
    // 针尖圆与 AB 两侧偏移线（净距 c 处）的交点角
    const abx = B.x - A.x;
    const aby = B.y - A.y;
    const abl = Math.hypot(abx, aby);
    if (abl > EPS) {
      const ux = abx / abl;
      const uy = aby / abl;
      const nx = -uy;
      const ny = ux;
      for (const s of [1, -1]) {
        // P 到偏移线 n·X = n·A + s·c 的有向距离
        const off = nx * A.x + ny * A.y + s * c - (nx * P.x + ny * P.y);
        if (Math.abs(off) > len + EPS) continue;
        const h = Math.sqrt(Math.max(0, len * len - off * off));
        const fx = P.x + off * nx;
        const fy = P.y + off * ny;
        cands.push(Math.atan2(fy + h * uy - P.y, fx + h * ux - P.x));
        cands.push(Math.atan2(fy - h * uy - P.y, fx - h * ux - P.x));
      }
    }
    if (!cands.length) return null;
    // 候选角排序去重（含首尾环绕）
    const uniq = [];
    for (const a of cands.map(normAngle).sort((p, q) => p - q)) {
      if (!uniq.length || a - uniq[uniq.length - 1] > 1e-9) uniq.push(a);
    }
    if (uniq.length > 1 && uniq[0] + TAU - uniq[uniq.length - 1] <= 1e-9) uniq.pop();
    // 判定每个候选角与每段弧中点是否越界（净距 ≤ c 即越界，等于限值也不放行）
    const distAt = (ang) => {
      const tx = P.x + len * Math.cos(ang);
      const ty = P.y + len * Math.sin(ang);
      return segSegDist(P.x, P.y, tx, ty, A.x, A.y, B.x, B.y);
    };
    const n = uniq.length;
    const ptIn = uniq.map((a) => distAt(a) <= c + SAFE_EPS);
    const arcIn = uniq.map((a, i) => {
      const b = uniq[(i + 1) % n];
      const mid = a + ((i + 1 < n ? b : b + TAU) - a) / 2;
      return distAt(mid) <= c + SAFE_EPS;
    });
    // 沿圆周交替排列：点[0]、弧[0]、点[1]、弧[1]……，越界元素构成单个连续段
    const elems = [];
    for (let i = 0; i < n; i++) {
      elems.push({ inside: ptIn[i], lo: uniq[i], hi: uniq[i] });
      elems.push({ inside: arcIn[i], lo: uniq[i], hi: uniq[(i + 1) % n] });
    }
    const anchor = elems.findIndex((e) => !e.inside);
    if (anchor === -1) return 'all';
    let lo = null;
    let hi = null;
    for (let k = 1; k <= elems.length; k++) {
      const e = elems[(anchor + k) % elems.length];
      if (e.inside) {
        if (lo === null) lo = e.lo;
        hi = e.hi;
      } else if (lo !== null) {
        break;
      }
    }
    if (lo === null) return null;
    return { lo, hi };
  }

  // 针从 a0 沿 dir 扫过 amount 时，首次进入越界区间 {lo,hi}|'all'|null 的位置
  function firstViolationInSweep(a0, amount, dir, interval) {
    if (interval === 'all') return { offset: 0, angle: a0 };
    if (!interval) return null;
    const { lo, hi } = interval;
    const span = normAngle(hi - lo);
    if (normAngle(a0 - lo) <= span + EPS) return { offset: 0, angle: a0 };
    // 沿旋转方向首先遇到的区间边界（ccw 为 lo，cw 为 hi）
    const boundary = dir === 'cw' ? hi : lo;
    const off = dir === 'cw' ? normAngle(a0 - boundary) : normAngle(boundary - a0);
    if (off > amount + EPS) return null;
    const clamped = Math.min(off, amount);
    return { offset: clamped, angle: advance(a0, clamped, dir) };
  }

  // 针尖在扫掠圆弧上到线段 AB 的最短距离（候选角精确求值，非采样）
  function minTipSegDist(n, amount, A, B) {
    const inSweep = (ang) => angleInSweep(n.a0, amount, n.dir, ang);
    const cands = [n.a0, advance(n.a0, amount, n.dir)];
    const addIf = (ang) => {
      if (inSweep(ang)) cands.push(ang);
    };
    for (const Q of [A, B]) {
      const phi = Math.atan2(Q.y - n.y, Q.x - n.x);
      addIf(phi);
      addIf(phi + Math.PI);
    }
    const abx = B.x - A.x;
    const aby = B.y - A.y;
    const abl = Math.hypot(abx, aby);
    if (abl > EPS) {
      const ux = abx / abl;
      const uy = aby / abl;
      const nx = -uy;
      const ny = ux;
      // 针尖圆上距直线 AB 最近/最远的点（半径与 AB 平行）
      const thetaN = Math.atan2(ny, nx);
      addIf(thetaN);
      addIf(thetaN + Math.PI);
      // 针尖圆与过端点的垂线的交点（线段最近特征切换处）
      for (const Q of [A, B]) {
        const dist = Math.abs((n.x - Q.x) * nx + (n.y - Q.y) * ny);
        if (dist > n.len + EPS) continue;
        const t = (n.x - Q.x) * ux + (n.y - Q.y) * uy;
        const h = Math.sqrt(Math.max(0, n.len * n.len - dist * dist));
        const fx = Q.x + t * ux;
        const fy = Q.y + t * uy;
        addIf(Math.atan2(fy + h * ny - n.y, fx + h * nx - n.x));
        addIf(Math.atan2(fy - h * ny - n.y, fx - h * nx - n.x));
      }
    }
    let m = Infinity;
    for (const ang of cands) {
      const tx = n.x + n.len * Math.cos(ang);
      const ty = n.y + n.len * Math.sin(ang);
      m = Math.min(m, pointSegDist(tx, ty, A.x, A.y, B.x, B.y));
    }
    return m;
  }

  /*
   * 活动针（弧度制针 n、扫掠幅度 amount）在整个扫掠过程中与停驻线段 AB 的最小净距。
   * = min（支点到 AB、两端点到扫掠扇形、针尖到 AB、相交时为 0）。
   */
  function minSweepSegDist(n, amount, A, B) {
    let m = pointSegDist(n.x, n.y, A.x, A.y, B.x, B.y);
    m = Math.min(m, distToSector({ x: A.x, y: A.y }, n, amount));
    m = Math.min(m, distToSector({ x: B.x, y: B.y }, n, amount));
    m = Math.min(m, minTipSegDist(n, amount, A, B));
    const iv = violationInterval({ x: n.x, y: n.y }, n.len, A, B, 0);
    if (firstViolationInSweep(n.a0, amount, n.dir, iv)) m = 0;
    return m;
  }

  /*
   * 校核入口。needles: [{x, y, len, a0, a1, dir}]（角度制，dir 为 'ccw'|'cw'），
   * circles: [{x, y, r}]。返回每根针的最小净距/首次触及角度，以及首项冲突
   * （按针的录入顺序、再按该针旋转方向上的最早触及位置）。
   */
  function checkAll(needles, circles) {
    const results = needles.map((n) => {
      const res = analyzeNeedle(toRadianNeedle(n), circles);
      if (res.firstTouch) {
        res.firstTouch = {
          circle: res.firstTouch.circle,
          angleDeg: rad2deg(normAngle(res.firstTouch.angle)),
          offsetDeg: rad2deg(res.firstTouch.offset),
        };
      }
      return res;
    });
    let firstConflict = null;
    results.forEach((res, i) => {
      if (!firstConflict && res.firstTouch) {
        firstConflict = {
          needle: i,
          circle: res.firstTouch.circle,
          angleDeg: res.firstTouch.angleDeg,
          offsetDeg: res.firstTouch.offsetDeg,
        };
      }
    });
    return { safe: !firstConflict, results, firstConflict };
  }

  /*
   * 分步注胶校核入口。needles、circles 同 checkAll；
   * order 为执行顺序（针索引的排列），minNeedleClearance 为最小针间净距限值。
   * 每一步仅执行针从起始角转至注入角：已完成针停在终止（注入）角，未执行针保持起始角。
   * 除原有颜料圆风险外，活动针身与任一停驻针身的距离必须始终严格大于限值
   * （端点接触或等于限值均判越界），对每一步连续求首次越界角度。
   * 返回每步的最小针间净距及对应针号、首项风险（按执行步骤、再按停驻针录入顺序），
   * 以及复用 checkAll 的颜料圆校核结论。
   */
  function checkSequential(needles, circles, order, minNeedleClearance) {
    const limit = minNeedleClearance;
    const circle = checkAll(needles, circles);
    const rads = needles.map(toRadianNeedle);
    const stepOf = new Array(needles.length).fill(-1);
    (order || []).forEach((ni, k) => {
      if (Number.isInteger(ni) && ni >= 0 && ni < needles.length) stepOf[ni] = k;
    });
    const steps = (order || []).map((ni, k) => {
      const n = rads[ni];
      if (!n) return null;
      const amount = sweepAmount(n.a0, n.a1, n.dir);
      let minClearance = Infinity;
      let minClearanceNeedle = -1;
      const violations = [];
      needles.forEach((_, j) => {
        if (j === ni) return;
        const pr = rads[j];
        // 停驻姿态：已完成的针停在注入角，未执行的针保持起始角
        const parked = stepOf[j] !== -1 && stepOf[j] < k ? pr.a1 : pr.a0;
        const A = { x: pr.x, y: pr.y };
        const B = { x: pr.x + pr.len * Math.cos(parked), y: pr.y + pr.len * Math.sin(parked) };
        const iv = violationInterval({ x: n.x, y: n.y }, n.len, A, B, limit);
        const fv = firstViolationInSweep(n.a0, amount, n.dir, iv);
        const minDist = minSweepSegDist(n, amount, A, B);
        if (minDist < minClearance - EPS) {
          minClearance = minDist;
          minClearanceNeedle = j;
        }
        if (fv) violations.push({ parkedNeedle: j, offset: fv.offset, angle: fv.angle });
      });
      // violations 已按停驻针录入顺序（索引升序）排列，首项即首项风险候选
      const firstViolation = violations.length ? violations[0] : null;
      return {
        step: k,
        needle: ni,
        safe: !firstViolation && circle.results[ni].safe,
        minClearance,
        minClearanceNeedle,
        violations: violations.map((v) => ({
          parkedNeedle: v.parkedNeedle,
          angleDeg: rad2deg(normAngle(v.angle)),
          offsetDeg: rad2deg(v.offset),
        })),
        firstViolation: firstViolation && {
          parkedNeedle: firstViolation.parkedNeedle,
          angleDeg: rad2deg(normAngle(firstViolation.angle)),
          offsetDeg: rad2deg(firstViolation.offset),
        },
      };
    });
    let firstRisk = null;
    for (const s of steps) {
      if (s && s.firstViolation) {
        firstRisk = {
          step: s.step,
          needle: s.needle,
          parkedNeedle: s.firstViolation.parkedNeedle,
          angleDeg: s.firstViolation.angleDeg,
          offsetDeg: s.firstViolation.offsetDeg,
        };
        break;
      }
    }
    return {
      mode: 'sequential',
      safe: !firstRisk && circle.safe,
      minNeedleClearance: limit,
      order: (order || []).slice(),
      steps,
      firstRisk,
      circle,
    };
  }

  // 分步注胶录入校验：净距限值有效且不小于 0，执行顺序为全部针的一个排列
  function validateSequential(needles, order, minNeedleClearance) {
    const errors = [];
    if (!Number.isFinite(minNeedleClearance) || minNeedleClearance < 0) {
      errors.push('最小针间净距必须为不小于 0 的有效数值');
    }
    const n = (needles || []).length;
    const isPerm =
      Array.isArray(order) &&
      order.length === n &&
      order.every((v) => Number.isInteger(v) && v >= 0 && v < n) &&
      new Set(order).size === n;
    if (!isPerm) errors.push('执行顺序必须恰好包含每根针一次');
    return errors;
  }

  // 录入校验：数量约束、数值有效性、起止角不同、保护圆不得覆盖支点
  function validate(needles, circles) {
    const errors = [];
    if (!Array.isArray(needles) || needles.length < 2 || needles.length > 5) {
      errors.push('针的数量必须为 2 至 5 根');
    }
    if (!Array.isArray(circles) || circles.length < 1 || circles.length > 6) {
      errors.push('保护圆的数量必须为 1 至 6 个');
    }
    (needles || []).forEach((n, i) => {
      const label = `针 #${i + 1}`;
      if (!n || ![n.x, n.y, n.len, n.a0, n.a1].every(Number.isFinite)) {
        errors.push(`${label} 存在无效数值`);
        return;
      }
      if (n.len <= 0) errors.push(`${label} 的针长必须为正数`);
      if (n.dir !== 'cw' && n.dir !== 'ccw') errors.push(`${label} 的旋转方向无效`);
      if (Math.abs(wrapPi(deg2rad(n.a1) - deg2rad(n.a0))) < 1e-9) {
        errors.push(`${label} 的起始角与终止角必须不同`);
      }
    });
    (circles || []).forEach((c, j) => {
      const label = `保护圆 #${j + 1}`;
      if (!c || ![c.x, c.y, c.r].every(Number.isFinite)) {
        errors.push(`${label} 存在无效数值`);
        return;
      }
      if (c.r <= 0) errors.push(`${label} 的半径必须为正数`);
      (needles || []).forEach((n, i) => {
        if (!n || ![n.x, n.y].every(Number.isFinite)) return;
        if (Math.hypot(c.x - n.x, c.y - n.y) < c.r - EPS) {
          errors.push(`${label} 覆盖了针 #${i + 1} 的支点`);
        }
      });
    });
    return errors;
  }

  return {
    checkAll,
    checkSequential,
    validate,
    validateSequential,
    // 供测试与调试使用的内部函数
    _internal: {
      distToSector,
      touchHalfWidth,
      sweepAmount,
      firstTouchVsCircle,
      segSegDist,
      violationInterval,
      firstViolationInSweep,
      minSweepSegDist,
    },
  };
});
