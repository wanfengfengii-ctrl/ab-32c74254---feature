/*
 * 扫掠几何模块单元测试（Node 原生断言，无第三方依赖）。
 * 运行：node tests/sweep.test.js，失败以非零码退出。
 */
'use strict';
const Sweep = require('../js/sweep.js');

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log('  PASS', name);
  } else {
    failures += 1;
    console.error('  FAIL', name);
  }
}
const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

console.log('== 录入校验 ==');
{
  const twoNeedles = [
    { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
    { x: 100, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
  ];
  check('合法数据无错误', Sweep.validate(twoNeedles, [{ x: 50, y: 50, r: 5 }]).length === 0);
  check('针数量不足被拒', Sweep.validate([twoNeedles[0]], [{ x: 50, y: 50, r: 5 }]).length > 0);
  check(
    '起止角相同被拒',
    Sweep.validate(
      [
        { x: 0, y: 0, len: 10, a0: 30, a1: 30, dir: 'ccw' },
        { x: 100, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
      ],
      [{ x: 50, y: 50, r: 5 }]
    ).length > 0
  );
  check(
    '起止角相差 360°（等价同角）被拒',
    Sweep.validate(
      [
        { x: 0, y: 0, len: 10, a0: 0, a1: 360, dir: 'ccw' },
        { x: 100, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
      ],
      [{ x: 50, y: 50, r: 5 }]
    ).length > 0
  );
  check(
    '保护圆覆盖支点被拒',
    Sweep.validate(twoNeedles, [{ x: 1, y: 1, r: 5 }]).length > 0
  );
  check(
    '保护圆数量超限被拒',
    Sweep.validate(twoNeedles, Array.from({ length: 7 }, (_, i) => ({ x: 500 + i * 10, y: 500, r: 1 }))).length > 0
  );
}

console.log('== 最小净距 ==');
{
  // 针：支点原点，长 10，0° -> 90° 逆时针
  const n = { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' };
  const base = [{ x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' }, { x: 500, y: 500, len: 10, a0: 0, a1: 90, dir: 'ccw' }];

  let r = Sweep.checkAll([n, { x: 500, y: 500, len: 10, a0: 0, a1: 90, dir: 'ccw' }], [{ x: 20, y: 0, r: 3 }]);
  check('圆在起始射线之外：净距 = 到针尖距离 - r', approx(r.results[0].minClearance, 10 - 3));
  check('该情形安全', r.results[0].safe === true);

  r = Sweep.checkAll(base, [{ x: 0, y: 20, r: 4 }]);
  check('圆心在扫掠角域内且在弧外：净距 = d - len - r', approx(r.results[0].minClearance, 20 - 10 - 4));

  r = Sweep.checkAll(base, [{ x: 3, y: 4, r: 1 }]);
  check('圆心在扇形内部：净距为负', approx(r.results[0].minClearance, -1) && !r.results[0].safe);

  r = Sweep.checkAll(base, [{ x: 0, y: 11, r: 1 }]);
  check('与弧相切：净距为 0 且判为不安全', approx(r.results[0].minClearance, 0, 1e-7) && !r.results[0].safe);

  r = Sweep.checkAll(base, [{ x: -10, y: -5, r: 2 }]);
  check(
    '圆在角域外：净距 = 到最近径向边界端点距离 - r',
    approx(r.results[0].minClearance, Math.hypot(10, 5) - 2)
  );
}

console.log('== 首次触及角度 ==');
{
  const mk = (a0, a1, dir) => [{ x: 0, y: 0, len: 10, a0, a1, dir }, { x: 500, y: 500, len: 10, a0: 0, a1: 90, dir: 'ccw' }];

  // 针尖恰好掠过圆底：圆 (0,15) r=5，针长 10，0°->180° 逆时针，触及角恰为 90°
  let r = Sweep.checkAll(mk(0, 180, 'ccw'), [{ x: 0, y: 15, r: 5 }]);
  check('针尖掠圆：首次触及角 = 90°', r.results[0].firstTouch && approx(r.results[0].firstTouch.angleDeg, 90));
  check('触及偏移量 = 90°', approx(r.results[0].firstTouch.offsetDeg, 90));

  // 切线边界：圆 (14,0) r=4，针长 14，-90° -> 90° 逆时针，触及角 = -asin(4/14)
  const gamma = (Math.asin(4 / 14) * 180) / Math.PI;
  r = Sweep.checkAll(
    [
      { x: 0, y: 0, len: 14, a0: -90, a1: 90, dir: 'ccw' },
      { x: 500, y: 500, len: 10, a0: 0, a1: 90, dir: 'ccw' },
    ],
    [{ x: 14, y: 0, r: 4 }]
  );
  check(
    '切线触及：首次触及角 = -asin(r/d)',
    r.results[0].firstTouch && approx(r.results[0].firstTouch.angleDeg, 360 - gamma, 1e-6)
  );

  // 顺时针：180° -> 0°，圆 (0,15) r=5，触及角 90°，偏移 90°
  r = Sweep.checkAll(mk(180, 0, 'cw'), [{ x: 0, y: 15, r: 5 }]);
  check(
    '顺时针扫掠：首次触及角 = 90°',
    r.results[0].firstTouch && approx(r.results[0].firstTouch.angleDeg, 90) && approx(r.results[0].firstTouch.offsetDeg, 90)
  );

  // 起始角已在触及区间内：圆 (10,0) r=2，针长 10，0° -> 180°
  r = Sweep.checkAll(mk(0, 180, 'ccw'), [{ x: 10, y: 0, r: 2 }]);
  check('起始即触及：偏移量 = 0', r.results[0].firstTouch && approx(r.results[0].firstTouch.offsetDeg, 0));

  // 圆在针长范围之外：永不触及
  r = Sweep.checkAll(mk(0, 180, 'ccw'), [{ x: 20, y: 0, r: 5 }]);
  check('圆超出针长：无触及且安全', r.results[0].firstTouch === null && r.results[0].safe);

  // 触及区间在扫掠范围之外：不触及
  r = Sweep.checkAll(mk(30, 180, 'ccw'), [{ x: 10, y: 0, r: 2 }]);
  check('触及区间在扫掠范围外：无触及', r.results[0].firstTouch === null && r.results[0].safe);
}

console.log('== 首项冲突排序 ==');
{
  // 针1安全、针2风险 -> 首项冲突为针2
  let r = Sweep.checkAll(
    [
      { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
      { x: 100, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
    ],
    [{ x: 100, y: 5, r: 3 }]
  );
  check('首项冲突落在首根风险针（录入顺序）', r.firstConflict && r.firstConflict.needle === 1 && r.firstConflict.circle === 0);

  // 两根针都风险：按录入顺序取第一根，即使第二根触及偏移更小
  r = Sweep.checkAll(
    [
      { x: 0, y: 0, len: 10, a0: 0, a1: 180, dir: 'ccw' },
      { x: 100, y: 0, len: 10, a0: 0, a1: 180, dir: 'ccw' },
    ],
    [
      { x: 0, y: 15, r: 5 },   // 针1 在 90° 触及
      { x: 105, y: 0, r: 3 },  // 针2 起始即触及
    ]
  );
  check('两根针均风险时按录入顺序取首根', r.firstConflict && r.firstConflict.needle === 0);
  check('首项冲突角度为针1的最早触及角', approx(r.firstConflict.angleDeg, 90));

  // 同一根针触及多个圆：取旋转方向上最早者
  r = Sweep.checkAll(
    [
      { x: 0, y: 0, len: 10, a0: 0, a1: 180, dir: 'ccw' },
      { x: 500, y: 500, len: 10, a0: 0, a1: 90, dir: 'ccw' },
    ],
    [
      { x: 0, y: 15, r: 5 },   // 90° 触及
      { x: 15, y: 0, r: 5 },   // 0° 起始即触及
    ]
  );
  check('同针多圆取最早触及（起始角）', r.results[0].firstTouch.circle === 1 && approx(r.results[0].firstTouch.offsetDeg, 0));
}

console.log('== 分步注胶：录入校验 ==');
{
  const two = [
    { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
    { x: 30, y: 0, len: 10, a0: 180, a1: 270, dir: 'ccw' },
  ];
  check(
    '合法顺序与净距无错误',
    Sweep.validateStepwise(two, { order: [1, 0], minNeedleClearance: 5 }).length === 0
  );
  check(
    '净距为 0 允许（仅禁止接触）',
    Sweep.validateStepwise(two, { order: [0, 1], minNeedleClearance: 0 }).length === 0
  );
  check(
    '净距为负被拒',
    Sweep.validateStepwise(two, { order: [0, 1], minNeedleClearance: -1 }).length > 0
  );
  check(
    '净距非数值被拒',
    Sweep.validateStepwise(two, { order: [0, 1], minNeedleClearance: NaN }).length > 0
  );
  check(
    '顺序缺针被拒',
    Sweep.validateStepwise(two, { order: [0], minNeedleClearance: 1 }).length > 0
  );
  check(
    '顺序重复针被拒',
    Sweep.validateStepwise(two, { order: [0, 0], minNeedleClearance: 1 }).length > 0
  );
  check(
    '顺序含非法针号被拒',
    Sweep.validateStepwise(two, { order: [0, 2], minNeedleClearance: 1 }).length > 0
  );
}

console.log('== 分步注胶：连续针间净距 ==');
{
  const far = [{ x: 500, y: 500, r: 5 }];
  // 两针安全场景：针1 (0,0) 长10 转 0°->90°；针2 (30,0) 长10 转 180°->270°
  const sw = [
    { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
    { x: 30, y: 0, len: 10, a0: 180, a1: 270, dir: 'ccw' },
  ];
  let r = Sweep.checkStepwise(sw, far, { order: [0, 1], minNeedleClearance: 1 });
  check('安全顺序整体安全', r.safe && r.needleSafe && r.firstNeedleConflict === null);
  check(
    '第1步最小针间净距 = 10（相对停驻针 #2）',
    approx(r.steps[0].minClearance, 10) && r.steps[0].minClearanceParked === 1
  );
  check(
    '第2步最小针间净距 = 20（相对停驻针 #1）',
    approx(r.steps[1].minClearance, 20) && r.steps[1].minClearanceParked === 0
  );

  // 净距等于限值不得放行：限值取 10 时第1步起始姿态即为 10
  r = Sweep.checkStepwise(sw, far, { order: [0, 1], minNeedleClearance: 10 });
  check('净距等于限值判为越界', !r.needleSafe && !r.safe);
  check(
    '等距越界在第1步起始位置',
    r.firstNeedleConflict.step === 0 &&
      r.firstNeedleConflict.parked === 1 &&
      approx(r.firstNeedleConflict.offsetDeg, 0)
  );

  // 中段越界：起止姿态净距均为 15，扫掠中段降至 5；限值 6 时端点检查无法发现
  const mid = [
    { x: 0, y: 0, len: 10, a0: 0, a1: 180, dir: 'ccw' },
    { x: 0, y: 20, len: 5, a0: 270, a1: 0, dir: 'ccw' },
  ];
  r = Sweep.checkStepwise(mid, far, { order: [0, 1], minNeedleClearance: 6 });
  const expectDeg = (Math.asin(289 / 300) * 180) / Math.PI;
  check('中段越界被检出（非仅起止姿态）', !r.needleSafe);
  check(
    '首次越界角 = asin(289/300)（连续精确解，非采样）',
    r.firstNeedleConflict && approx(r.firstNeedleConflict.angleDeg, expectDeg, 1e-6)
  );
  check(
    '越界发生在扫掠中段',
    r.firstNeedleConflict.offsetDeg > 1 && r.firstNeedleConflict.offsetDeg < 179
  );
  check('第1步最小针间净距 = 5', approx(r.steps[0].minClearance, 5) && r.steps[0].minClearanceParked === 1);

  // 同一几何调整执行顺序后安全
  r = Sweep.checkStepwise(mid, far, { order: [1, 0], minNeedleClearance: 6 });
  check('调整执行顺序后针间安全', r.needleSafe);
  check(
    '换序后逐步净距为 15 与 10',
    approx(r.steps[0].minClearance, 15) &&
      r.steps[0].minClearanceParked === 0 &&
      approx(r.steps[1].minClearance, 10) &&
      r.steps[1].minClearanceParked === 1
  );
}

console.log('== 分步注胶：首项风险排序 ==');
{
  const far = [{ x: 500, y: 500, r: 5 }];
  // 针2、针3 的停驻姿态分别在针1扫掠约 50°、26° 处越界；
  // 执行顺序 [针3, 针1, 针2]：第1步（针3）安全，第2步（针1）对两根停驻针均越界
  const trio = [
    { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
    { x: 5.4, y: 8.66, len: 2, a0: 0, a1: 90, dir: 'ccw' },
    { x: 8.66, y: 5.4, len: 2, a0: 90, a1: 180, dir: 'ccw' },
  ];
  const r = Sweep.checkStepwise(trio, far, { order: [2, 0, 1], minNeedleClearance: 1 });
  check('第1步（针3先注胶）安全', r.steps[0].safe);
  check(
    '第1步最小净距 = hypot(1.26,3.26)-2（相对停驻针 #2）',
    approx(r.steps[0].minClearance, Math.hypot(1.26, 3.26) - 2) && r.steps[0].minClearanceParked === 1
  );
  check('第2步（针1注胶）存在风险', !r.steps[1].safe);
  const p1 = r.steps[1].pairs.find((p) => p.parked === 1);
  const p2 = r.steps[1].pairs.find((p) => p.parked === 2);
  check('第2步两根停驻针均越界', !!(p1.firstViolation && p2.firstViolation));
  check(
    '停驻针 #3 的越界角早于停驻针 #2',
    p2.firstViolation.offsetDeg < p1.firstViolation.offsetDeg
  );
  check(
    '首项风险按执行步骤、再按停驻针录入顺序取针 #2（而非角度更早的针 #3）',
    r.firstNeedleConflict.step === 1 && r.firstNeedleConflict.active === 0 && r.firstNeedleConflict.parked === 1
  );
}

if (failures > 0) {
  console.error(`\n${failures} 项测试失败`);
  process.exit(1);
}
console.log('\n全部测试通过');
