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
    validate,
    // 供测试与调试使用的内部函数
    _internal: { distToSector, touchHalfWidth, sweepAmount, firstTouchVsCircle },
  };
});
