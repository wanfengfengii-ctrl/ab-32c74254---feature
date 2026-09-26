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
  const needles = [
    { x: 0, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
    { x: 100, y: 0, len: 10, a0: 0, a1: 90, dir: 'ccw' },
  ];
  check('合法顺序与净距无错误', Sweep.validateSequential(needles, [0, 1], 5).length === 0);
  check('净距为 0 合法', Sweep.validateSequential(needles, [0, 1], 0).length === 0);
  check('负净距被拒', Sweep.validateSequential(needles, [0, 1], -1).length > 0);
  check('非数值净距被拒', Sweep.validateSequential(needles, [0, 1], NaN).length > 0);
  check('顺序缺针被拒', Sweep.validateSequential(needles, [0], 5).length > 0);
  check('顺序重复被拒', Sweep.validateSequential(needles, [1, 1], 5).length > 0);
  check('顺序越界被拒', Sweep.validateSequential(needles, [0, 2], 5).length > 0);
}

console.log('== 分步注胶：连续首次越界 ==');
{
  const far = [{ x: 500, y: 500, r: 1 }];
  // 针1：支点原点，长 10，0° -> 180° 逆时针；针2 停驻于 (0,12)->(0,8)
  // 起止姿态净距均为 8（安全），仅扫掠中段穿过停驻线段：连续校核必须捕获
  const mk = () => [
    { x: 0, y: 0, len: 10, a0: 0, a1: 180, dir: 'ccw' },
    { x: 0, y: 12, len: 4, a0: 270, a1: 90, dir: 'ccw' },
  ];
  const expectDeg = 90 - (Math.asin(1 / 8) * 180) / Math.PI; // ≈ 82.8192°

  let r = Sweep.checkSequential(mk(), far, [0, 1], 1);
  check('仅中段越界也被捕获（非起止姿态比较）', !r.safe && r.firstRisk !== null);
  check(
    '首项风险定位：第 1 步、针1、停驻针2',
    r.firstRisk.step === 0 && r.firstRisk.needle === 0 && r.firstRisk.parkedNeedle === 1
  );
  check('首次越界角 = 90° - asin(1/8)', approx(r.firstRisk.angleDeg, expectDeg, 1e-6));
  check('越界偏移量同步给出', approx(r.firstRisk.offsetDeg, expectDeg, 1e-6));
  check('该步最小针间净距为 0（相交）', approx(r.steps[0].minClearance, 0, 1e-9));

  // 接触即越界：限值 0 时，针身在 90° 与停驻线段相交
  r = Sweep.checkSequential(mk(), far, [0, 1], 0);
  check('端点接触不得放行（限值 0 仍判越界）', !r.safe && r.firstRisk !== null);
  check('接触越界角 = 90°', approx(r.firstRisk.angleDeg, 90, 1e-6));
}

console.log('== 分步注胶：停驻姿态与执行顺序 ==');
{
  const far = [{ x: 500, y: 500, r: 1 }];
  // 针2：起始角 90°（停上方，安全），注入角 270°（停下方，伸入针1扫掠路径）
  const mk = () => [
    { x: 0, y: 0, len: 10, a0: 0, a1: 180, dir: 'ccw' },
    { x: 0, y: 12, len: 4, a0: 90, a1: 270, dir: 'ccw' },
  ];
  const expectDeg = 90 - (Math.asin(1 / 8) * 180) / Math.PI;

  let r = Sweep.checkSequential(mk(), far, [0, 1], 1);
  check('顺序 [1,2] 安全', r.safe && r.firstRisk === null);
  check('安全时给出第 1 步最小针间净距及针号', approx(r.steps[0].minClearance, 2, 1e-9) && r.steps[0].minClearanceNeedle === 1);
  check('安全时给出第 2 步最小针间净距及针号', approx(r.steps[1].minClearance, 8, 1e-9) && r.steps[1].minClearanceNeedle === 0);

  r = Sweep.checkSequential(mk(), far, [1, 0], 1);
  check('顺序 [2,1] 时已完成针停在注入角引发越界', !r.safe);
  check(
    '首项风险定位：第 2 步、针1、停驻针2',
    r.firstRisk.step === 1 && r.firstRisk.needle === 0 && r.firstRisk.parkedNeedle === 1
  );
  check('越界角 = 90° - asin(1/8)', approx(r.firstRisk.angleDeg, expectDeg, 1e-6));

  // 等于限值不得放行：顺序 [1,2] 第 1 步最小净距恰为 2
  r = Sweep.checkSequential(mk(), far, [0, 1], 2);
  check('净距等于限值判越界', !r.safe && r.firstRisk.step === 0);
  r = Sweep.checkSequential(mk(), far, [0, 1], 1.9999);
  check('净距略大于限值放行', r.safe);
}

console.log('== 分步注胶：首项风险稳定排序 ==');
{
  const far = [{ x: 500, y: 500, r: 1 }];
  // 针3 扫掠会先后触及停驻针2（约 38.09°）与停驻针1（约 82.82°），
  // 首项风险须按停驻针录入顺序取针1，而非按越界角早晚取针2
  const needles = [
    { x: 0, y: 12, len: 4, a0: 270, a1: 90, dir: 'ccw' },
    { x: 8, y: 8, len: 3, a0: 225, a1: 45, dir: 'ccw' },
    { x: 0, y: 0, len: 10, a0: 0, a1: 180, dir: 'ccw' },
  ];
  const r = Sweep.checkSequential(needles, far, [2, 0, 1], 1);
  check('首项风险按执行步骤定位（第 1 步、针3）', r.firstRisk.step === 0 && r.firstRisk.needle === 2);
  check('同一步内按停驻针录入顺序取针1', r.firstRisk.parkedNeedle === 0);
  check('首项风险角度为停驻针1的首次越界角', approx(r.firstRisk.angleDeg, 90 - (Math.asin(1 / 8) * 180) / Math.PI, 1e-6));
  check(
    '该步越界列表按停驻针录入顺序排列',
    r.steps[0].violations.length === 2 &&
      r.steps[0].violations[0].parkedNeedle === 0 &&
      r.steps[0].violations[1].parkedNeedle === 1
  );
  const dParked = Math.hypot(8 - 3 * Math.SQRT1_2, 8 - 3 * Math.SQRT1_2);
  check(
    '停驻针2越界角更早（约 38.09°）但首项仍取针1',
    approx(r.steps[0].violations[1].angleDeg, 45 - (Math.asin(1 / dParked) * 180) / Math.PI, 1e-6) &&
      r.steps[0].violations[1].angleDeg < r.steps[0].violations[0].angleDeg
  );
}

console.log('== 分步注胶：针尖掠过胶囊直边 ==');
{
  const far = [{ x: 500, y: 500, r: 1 }];
  // 针1：支点 (60,70)，长 50，90° -> 180° 逆时针；针2 停驻于 (0,0)->(0,100)
  // 越界区间由针尖圆与偏移线 x=15 的交点决定：180° - acos(45/50)
  const needles = [
    { x: 60, y: 70, len: 50, a0: 90, a1: 180, dir: 'ccw' },
    { x: 0, y: 0, len: 100, a0: 90, a1: 180, dir: 'ccw' },
  ];
  const expectDeg = 180 - (Math.acos(45 / 50) * 180) / Math.PI; // ≈ 154.158°
  const r = Sweep.checkSequential(needles, far, [0, 1], 15);
  check('针尖越界：首次越界角 = 180° - acos(0.9)', approx(r.firstRisk.angleDeg, expectDeg, 1e-6));
  check('越界偏移量 = 越界角 - 起始角', approx(r.firstRisk.offsetDeg, expectDeg - 90, 1e-6));
  check('该步最小针间净距 = 10', approx(r.steps[0].minClearance, 10, 1e-9));
}

console.log('== 分步注胶：颜料圆结论保留 ==');
{
  // 针间安全但颜料圆有风险：整体不安全，首项风险（针间）为空，圆冲突仍在
  const needles = [
    { x: 0, y: 0, len: 10, a0: 0, a1: 180, dir: 'ccw' },
    { x: 0, y: 12, len: 4, a0: 90, a1: 270, dir: 'ccw' },
  ];
  const r = Sweep.checkSequential(needles, [{ x: 0, y: 5, r: 3 }], [0, 1], 1);
  check('针间无越界', r.firstRisk === null);
  check('颜料圆冲突保留（针1 触及圆1）', r.circle.firstConflict && r.circle.firstConflict.needle === 0 && r.circle.firstConflict.circle === 0);
  check('整体判为不安全', !r.safe);

  // 旧草稿（未启用分步注胶）：checkAll 不做针间校核，交叉针也照常放行
  const crossing = [
    { x: 0, y: 0, len: 10, a0: 0, a1: 180, dir: 'ccw' },
    { x: 0, y: 12, len: 4, a0: 270, a1: 90, dir: 'ccw' },
  ];
  const legacy = Sweep.checkAll(crossing, [{ x: 500, y: 500, r: 1 }]);
  check('旧路径不做针间校核', legacy.safe && legacy.firstConflict === null);
}

if (failures > 0) {
  console.error(`\n${failures} 项测试失败`);
  process.exit(1);
}
console.log('\n全部测试通过');
