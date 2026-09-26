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

console.log('\n== 分步注胶烟测 ==');
{
  // 修复室录入：针1 在针2 附近扫掠；针2 的停驻姿态位于针1 扫掠路径中段
  const swNeedles = [
    { x: 0, y: 0, len: 10, a0: 0, a1: 180, dir: 'ccw' },
    { x: 0, y: 20, len: 5, a0: 270, a1: 0, dir: 'ccw' },
  ];
  const swCircles = [{ x: 500, y: 500, r: 5 }];
  const limit = 6;

  const swErrors = Sweep.validate(swNeedles, swCircles).concat(
    Sweep.validateStepwise(swNeedles, { order: [0, 1], minNeedleClearance: limit })
  );
  expect('分步录入通过校验', swErrors.length === 0);

  // 顺序 [针1 → 针2]：针1 扫掠中段与停驻的针2 越界（起止姿态净距均为 15 > 6）
  const r1 = Sweep.checkStepwise(swNeedles, swCircles, { order: [0, 1], minNeedleClearance: limit });
  const expectDeg = (Math.asin(289 / 300) * 180) / Math.PI;
  expect('顺序 [针1→针2] 检出针间风险', !r1.needleSafe && !r1.safe);
  expect(
    '首项风险为第 1 步、停驻针 #2',
    r1.firstNeedleConflict.step === 0 && r1.firstNeedleConflict.active === 0 && r1.firstNeedleConflict.parked === 1
  );
  expect('首次越界角 ≈ asin(289/300)（连续解）', approx(r1.firstNeedleConflict.angleDeg, expectDeg, 1e-6));
  expect(
    '越界发生在扫掠中段（起止姿态均安全）',
    r1.firstNeedleConflict.offsetDeg > 1 && r1.firstNeedleConflict.offsetDeg < 179
  );
  expect('颜料圆校核结论在分步模式下保留', r1.circle.safe && r1.circle.results.length === 2);

  // 修复师依据最早越界步骤与停驻针号调整顺序：[针2 → 针1] 后针间安全
  const r2 = Sweep.checkStepwise(swNeedles, swCircles, { order: [1, 0], minNeedleClearance: limit });
  expect('调整执行顺序后整体安全', r2.safe && r2.needleSafe);
  expect(
    '安全时列出第 1 步最小净距 15（停驻针 #1）',
    approx(r2.steps[0].minClearance, 15) && r2.steps[0].minClearanceParked === 0
  );
  expect(
    '安全时列出第 2 步最小净距 10（停驻针 #2）',
    approx(r2.steps[1].minClearance, 10) && r2.steps[1].minClearanceParked === 1
  );

  // 端点接触/等于限值不得放行：换序后第 1 步净距恰为 15，限值取 15 即越界
  const r3 = Sweep.checkStepwise(swNeedles, swCircles, { order: [1, 0], minNeedleClearance: 15 });
  expect(
    '净距等于限值判为越界（第 1 步起始位置）',
    !r3.needleSafe && r3.firstNeedleConflict.step === 0 && approx(r3.firstNeedleConflict.offsetDeg, 0)
  );
}

if (!ok) {
  console.error('烟测失败');
  process.exit(1);
}
console.log('烟测通过');
