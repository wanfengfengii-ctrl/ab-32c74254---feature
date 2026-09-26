/*
 * 注胶针扫掠几何模块。
 * 把每根针从起始角沿指定方向旋转到终止角所扫过的区域视为带方向的圆扇形，
 * 精确计算保护圆与该扇形的最小净距以及针身首次触及保护圆的角度。
 * 分步注胶模式下，对每一步连续求活动针扫掠时与各停驻针身（线段）的
 * 最小针间净距与首次越界角度（临界角精确求解 + 区间求根，不做角度采样）。
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

  /* ---------------- 分步注胶：活动针身与停驻针身的连续净距 ---------------- */

  // 线段 AB 与线段 CD 是否相交（含端点接触与共线重叠）
  function segsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
    const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    return d1 * d2 <= 0 && d3 * d4 <= 0;
  }

  // 两线段最短距离（相交或接触为 0）
  function segSegDist(ax, ay, bx, by, cx, cy, dx, dy) {
    if (segsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
    return Math.min(
      pointSegDist(ax, ay, cx, cy, dx, dy),
      pointSegDist(bx, by, cx, cy, dx, dy),
      pointSegDist(cx, cy, ax, ay, bx, by),
      pointSegDist(dx, dy, ax, ay, bx, by)
    );
  }

  // 活动针 n（弧度制）转到角度 theta 时，针身与停驻线段 p（弧度角）的距离
  function distAtAngle(n, theta, p) {
    const tx = n.x + n.len * Math.cos(theta);
    const ty = n.y + n.len * Math.sin(theta);
    const sx = p.x + p.len * Math.cos(p.angle);
    const sy = p.y + p.len * Math.sin(p.angle);
    return segSegDist(n.x, n.y, tx, ty, p.x, p.y, sx, sy);
  }

  /*
   * 活动针 vs 停驻线段的距离函数 d(θ) 的全部临界角（局部极小/极大候选）。
   * d(θ) 是四类端点-线段距离的下包络（相交时额外为 0）；C¹ 函数下包络的
   * 局部极小只能出现在某个分段的局部极小处，因此候选角为：
   *  - 停驻线段两端点相对活动支点的方位角（及其对径角）；
   *  - 活动支点在停驻线段上的垂足方位角（垂足落在线段内时，及其对径角）；
   *  - 活动针尖圆与停驻线段的交点方位角（距离为 0 的角度）。
   */
  function criticalAngles(n, p) {
    const angs = [];
    const sx = p.x + p.len * Math.cos(p.angle);
    const sy = p.y + p.len * Math.sin(p.angle);
    [[p.x, p.y], [sx, sy]].forEach(([ex, ey]) => {
      const dx = ex - n.x;
      const dy = ey - n.y;
      if (Math.hypot(dx, dy) > EPS) {
        const phi = Math.atan2(dy, dx);
        angs.push(phi, phi + Math.PI);
      }
    });
    const bx = sx - p.x;
    const by = sy - p.y;
    const blen = Math.hypot(bx, by);
    if (blen > EPS) {
      const ux = bx / blen;
      const uy = by / blen;
      const t = (n.x - p.x) * ux + (n.y - p.y) * uy; // 支点垂足在线段上的参数
      if (t > EPS && t < blen - EPS) {
        const fx = p.x + t * ux - n.x;
        const fy = p.y + t * uy - n.y;
        if (Math.hypot(fx, fy) > EPS) angs.push(Math.atan2(fy, fx), Math.atan2(fy, fx) + Math.PI);
      }
      // 针尖圆（支点为心、针长为半径）与停驻线段的交点
      const h2 = (n.x - p.x) * (n.x - p.x) + (n.y - p.y) * (n.y - p.y) - t * t;
      const h = Math.sqrt(Math.max(0, h2));
      if (h <= n.len + EPS) {
        const ds = Math.sqrt(Math.max(0, n.len * n.len - h * h));
        [t - ds, t + ds].forEach((s) => {
          if (s >= -EPS && s <= blen + EPS) {
            const ix = p.x + s * ux - n.x;
            const iy = p.y + s * uy - n.y;
            if (Math.hypot(ix, iy) > EPS) angs.push(Math.atan2(iy, ix));
          }
        });
      }
    }
    return angs;
  }

  // 把临界角映射为沿旋转方向的扫掠偏移（升序去重，含端点 0 与 amount）
  function sweepOffsets(n, amount, angles) {
    const offs = [0, amount];
    angles.forEach((a) => {
      const off = n.dir === 'cw' ? normAngle(n.a0 - a) : normAngle(a - n.a0);
      if (off <= amount + EPS) offs.push(Math.min(Math.max(off, 0), amount));
    });
    offs.sort((x, y) => x - y);
    const dedup = [];
    offs.forEach((o) => {
      if (!dedup.length || o - dedup[dedup.length - 1] > EPS) dedup.push(o);
    });
    return dedup;
  }

  /*
   * 活动针 n（弧度制）从 a0 沿 dir 扫过 amount 的过程中，与停驻线段 p 之间的：
   *  - minDist / minOffset：连续最小距离及取得位置（在全部临界角上精确求值，
   *    相邻临界角之间下包络无内部极小，故最小值必在临界角处）；
   *  - firstViolation：净距首次不满足「严格大于 limit」的位置（等距即越界），
   *    在相邻临界角区间上对 d(θ)=limit 二分求根，不触及为 null。
   */
  function sweepVsSegment(n, amount, p, limit) {
    const offs = sweepOffsets(n, amount, criticalAngles(n, p));
    const distAt = (off) => distAtAngle(n, advance(n.a0, off, n.dir), p);
    let minDist = Infinity;
    let minOffset = 0;
    offs.forEach((o) => {
      const d = distAt(o);
      if (d < minDist - EPS) {
        minDist = d;
        minOffset = o;
      }
    });
    let firstViolation = null;
    if (minDist <= limit + SAFE_EPS) {
      if (distAt(0) <= limit + SAFE_EPS) {
        firstViolation = { offset: 0, angle: n.a0 };
      } else {
        for (let i = 1; i < offs.length; i++) {
          if (distAt(offs[i]) <= limit + SAFE_EPS) {
            // (offs[i-1], offs[i]] 内存在唯一自上而下的穿越，二分定位
            let lo = offs[i - 1];
            let hi = offs[i];
            for (let it = 0; it < 80; it++) {
              const mid = (lo + hi) / 2;
              if (distAt(mid) > limit) lo = mid;
              else hi = mid;
            }
            firstViolation = { offset: hi, angle: advance(n.a0, hi, n.dir) };
            break;
          }
        }
      }
    }
    return { minDist, minOffset, firstViolation };
  }

  /*
   * 分步注胶校核。order 为针索引的执行排列；minNeedleClearance 为最小针间净距限值。
   * 第 k 步仅针 order[k] 从起始角转到注入角（a1）；已完成针停在 a1，未执行针保持 a0。
   * 颜料保护圆风险沿用 checkAll 结论；针间风险对每一步连续求解，
   * 首项风险按执行步骤、再按停驻针录入顺序稳定返回。
   */
  function checkStepwise(needles, circles, options) {
    const order = options.order;
    const limit = options.minNeedleClearance;
    const circle = checkAll(needles, circles);
    const rads = needles.map(toRadianNeedle);
    const stepOf = [];
    order.forEach((ni, k) => {
      stepOf[ni] = k;
    });
    const steps = order.map((activeIdx, k) => {
      const n = rads[activeIdx];
      const amount = sweepAmount(n.a0, n.a1, n.dir);
      const pairs = [];
      for (let j = 0; j < needles.length; j++) {
        if (j === activeIdx) continue;
        const pn = rads[j];
        const parked = {
          x: pn.x,
          y: pn.y,
          len: pn.len,
          angle: stepOf[j] < k ? pn.a1 : pn.a0, // 已完成针停在注入角，未执行针保持起始角
        };
        const r = sweepVsSegment(n, amount, parked, limit);
        pairs.push({
          parked: j,
          minClearance: r.minDist,
          minOffsetDeg: rad2deg(r.minOffset),
          firstViolation: r.firstViolation
            ? { offsetDeg: rad2deg(r.firstViolation.offset), angleDeg: rad2deg(normAngle(r.firstViolation.angle)) }
            : null,
        });
      }
      pairs.sort((a, b) => a.parked - b.parked); // 停驻针按录入顺序
      let minClearance = Infinity;
      let minClearanceParked = -1;
      pairs.forEach((pr) => {
        if (pr.minClearance < minClearance - EPS) {
          minClearance = pr.minClearance;
          minClearanceParked = pr.parked;
        }
      });
      return {
        step: k,
        active: activeIdx,
        safe: !pairs.some((pr) => pr.firstViolation),
        minClearance,
        minClearanceParked,
        pairs,
      };
    });
    let firstNeedleConflict = null;
    for (const st of steps) {
      if (firstNeedleConflict) break;
      for (const pr of st.pairs) {
        if (pr.firstViolation) {
          firstNeedleConflict = {
            step: st.step,
            active: st.active,
            parked: pr.parked,
            angleDeg: pr.firstViolation.angleDeg,
            offsetDeg: pr.firstViolation.offsetDeg,
          };
          break;
        }
      }
    }
    const needleSafe = !firstNeedleConflict;
    return {
      mode: 'stepwise',
      safe: circle.safe && needleSafe,
      circle,
      limit,
      order: order.slice(),
      steps,
      needleSafe,
      firstNeedleConflict,
    };
  }

  // 分步注胶录入校验：净距限值有效且非负；执行顺序为全部针的一个排列
  function validateStepwise(needles, options) {
    const errors = [];
    const o = options || {};
    if (!Number.isFinite(o.minNeedleClearance) || o.minNeedleClearance < 0) {
      errors.push('最小针间净距必须为不小于 0 的有效数值');
    }
    const n = Array.isArray(needles) ? needles.length : 0;
    const order = o.order;
    let orderOk = Array.isArray(order) && order.length === n;
    if (orderOk) {
      const seen = new Set();
      for (const idx of order) {
        if (!Number.isInteger(idx) || idx < 0 || idx >= n || seen.has(idx)) {
          orderOk = false;
          break;
        }
        seen.add(idx);
      }
    }
    if (!orderOk) errors.push('执行顺序必须为全部针的一个排列（每根针恰好执行一次）');
    return errors;
  }

  // 录入校验：数量约束、数值有效性、起止角不同、保护圆不得覆盖支点
  function validate(needles, circles) {    const errors = [];
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
    checkStepwise,
    validate,
    validateStepwise,
    // 供测试与调试使用的内部函数
    _internal: {
      distToSector,
      touchHalfWidth,
      sweepAmount,
      firstTouchVsCircle,
      segSegDist,
      criticalAngles,
      sweepVsSegment,
    },
  };
});
