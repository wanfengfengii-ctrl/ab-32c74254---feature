#!/usr/bin/env node
/*
 * 注胶扫掠模块烟测：模拟修复室真实录入，
 * 验证首项冲突定位与移开保护圆后的安全放行。
 */
'use strict';
const Sweep = require('../js/sweep.js');

const needles = [
  { x: 0, y: 0, len: 100, a0: 0, a1: 90, dir: 'ccw' },
  { x: 300, y: 0, len: 100, a0: 180, a1: 90, dir: 'cw' },
  { x: 600, y: 0, len: 100, a0: 0, a1: 90, dir: 'ccw' },
];
const circles = [
  { x: 150, y: 50, r: 20 },
  { x: 300, y: 130, r: 20 },
  { x: 600, y: 105, r: 10 },
];

const errors = Sweep.validate(needles, circles);
if (errors.length) {
  console.error('烟测数据未通过录入校验:', errors);
  process.exit(1);
}

const res = Sweep.checkAll(needles, circles);
console.log(
  '逐针结果:',
  JSON.stringify(
    res.results.map((r) => ({
      safe: r.safe,
      minClearance: +r.minClearance.toFixed(4),
      firstTouchDeg: r.firstTouch ? +r.firstTouch.angleDeg.toFixed(4) : null,
    })),
    null,
    2
  )
);

const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
let ok = true;
function expect(name, cond) {
  console.log(cond ? '  PASS' : '  FAIL', name);
  if (!cond) ok = false;
}

expect('针1安全', res.results[0].safe);
expect('针1净距 ≈ 38.1139', approx(res.results[0].minClearance, Math.hypot(150, 50) - 100 - 20));
expect('针2安全', res.results[1].safe);
expect('针2净距 = 10', approx(res.results[1].minClearance, 10, 1e-9));
expect('针3存在风险', !res.results[2].safe);

// 针3：圆 (600,105) r=10，针长 100，切点在针尖之外，触及边界由针尖掠圆决定
const beta = (Math.acos((105 * 105 + 100 * 100 - 10 * 10) / (2 * 105 * 100)) * 180) / Math.PI;
expect('针3首次触及角 ≈ 90° - β', res.results[2].firstTouch && approx(res.results[2].firstTouch.angleDeg, 90 - beta));
expect(
  '首项冲突为针3 / 保护圆3',
  res.firstConflict && res.firstConflict.needle === 2 && res.firstConflict.circle === 2
);

// 将保护圆3 移出扫掠区域后，整体应安全
const moved = Sweep.checkAll(needles, [circles[0], circles[1], { x: 600, y: 130, r: 10 }]);
expect('移开保护圆后整体安全', moved.safe && moved.firstConflict === null);

if (!ok) {
  console.error('烟测失败');
  process.exit(1);
}
console.log('烟测通过');
