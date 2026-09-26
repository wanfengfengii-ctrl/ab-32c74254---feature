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

/* ---------------- 分步注胶烟测 ----------------
 * 场景：针1（原点，长 100，0°->90°）与针2（(40,105)，长 50，90°->0° 逆时针，扫 270°）。
 * 针2 的扫掠会逼近针1 的注入角停驻位（y 轴线段），但远离其起始角停驻位（x 轴线段）。
 */
console.log('--- 分步注胶 ---');
const seqNeedles = [
  { x: 0, y: 0, len: 100, a0: 0, a1: 90, dir: 'ccw' },
  { x: 40, y: 105, len: 50, a0: 90, a1: 0, dir: 'ccw' },
];
const seqCircles = [{ x: 200, y: 200, r: 10 }];

const seqErrors = Sweep.validate(seqNeedles, seqCircles).concat(
  Sweep.validateSequential(seqNeedles, [0, 1], 10)
);
if (seqErrors.length) {
  console.error('分步烟测数据未通过录入校验:', seqErrors);
  process.exit(1);
}

// 顺序 [针1, 针2]：第 2 步针2 扫掠时，针1 停在注入角 90°（y 轴线段 (0,0)-(0,100)），
// 针2 在 180°+atan(5/40)-asin(10/hypot(40,5)) ≈ 172.76° 处首次越界
const phi = 180 + (Math.atan(5 / 40) * 180) / Math.PI;
const gamma = (Math.asin(10 / Math.hypot(40, 5)) * 180) / Math.PI;
const expectAngle = phi - gamma;
const seq1 = Sweep.checkSequential(seqNeedles, seqCircles, [0, 1], 10);
expect('顺序 [1,2]：第 1 步安全', seq1.steps[0].safe);
expect(
  '顺序 [1,2]：第 1 步最小针间净距 ≈ 12.36（相对针2）',
  approx(seq1.steps[0].minClearance, Math.hypot(40, 105) - 100, 1e-6) && seq1.steps[0].minClearanceNeedle === 1
);
expect('顺序 [1,2]：整体不安全', !seq1.safe);
expect(
  '首项风险：第 2 步、针2、停驻针1',
  seq1.firstRisk && seq1.firstRisk.step === 1 && seq1.firstRisk.needle === 1 && seq1.firstRisk.parkedNeedle === 0
);
expect('首项风险越界角 ≈ 172.76°', seq1.firstRisk && approx(seq1.firstRisk.angleDeg, expectAngle, 1e-6));
expect('首项风险偏移量 ≈ 82.76°', seq1.firstRisk && approx(seq1.firstRisk.offsetDeg, expectAngle - 90, 1e-6));
expect('颜料圆结论保留且安全', seq1.circle.safe);

// 修复师依据首项风险调整顺序为 [针2, 针1]：针2 先注胶后停在 0°（远离针1 路径），整体安全
const seq2 = Sweep.checkSequential(seqNeedles, seqCircles, [1, 0], 10);
expect('调整顺序为 [2,1] 后整体安全', seq2.safe && seq2.firstRisk === null);
expect(
  '顺序 [2,1]：第 1 步最小针间净距 = 55（相对针1）',
  approx(seq2.steps[0].minClearance, 55, 1e-9) && seq2.steps[0].minClearanceNeedle === 0
);
expect(
  '顺序 [2,1]：第 2 步最小针间净距 ≈ 12.36（相对针2）',
  approx(seq2.steps[1].minClearance, Math.hypot(40, 105) - 100, 1e-6) && seq2.steps[1].minClearanceNeedle === 1
);

// 等于限值不得放行：限值恰好取第 1 步最小净距 55 时判越界
const seq3 = Sweep.checkSequential(seqNeedles, seqCircles, [1, 0], 55);
expect('净距等于限值判越界', !seq3.safe && seq3.firstRisk && seq3.firstRisk.step === 0);

if (!ok) {
  console.error('烟测失败');
  process.exit(1);
}
console.log('烟测通过');
