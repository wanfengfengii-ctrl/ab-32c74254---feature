#!/usr/bin/env node
/*
 * verify 一次性服务入口：依次执行代码测试、构建、注胶扫掠模块烟测。
 * 任一步骤失败即以非零码退出，全部通过以 0 退出。
 */
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

const steps = [
  ['代码测试', 'tests/sweep.test.js'],
  ['构建', 'scripts/build.js'],
  ['注胶扫掠模块烟测', 'scripts/smoke.js'],
];

for (const [name, script] of steps) {
  console.log(`\n=== ${name}: node ${script} ===`);
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', script)], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n[verify] ${name} 失败（退出码 ${r.status}）`);
    process.exit(r.status || 1);
  }
}
console.log('\n[verify] 全部通过');
process.exit(0);
