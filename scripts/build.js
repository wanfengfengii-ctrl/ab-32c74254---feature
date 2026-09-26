#!/usr/bin/env node
/*
 * 构建：对前端脚本做语法检查、核对 index.html 资源引用，
 * 并把静态文件装配到 dist/（只读文件系统下落到临时目录）。
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const jsFiles = ['js/sweep.js', 'js/app.js'];
const assets = ['index.html', 'css/style.css', ...jsFiles];

let failed = false;

for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', path.join(root, f)], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`语法检查失败: ${f}\n${r.stderr}`);
    failed = true;
  } else {
    console.log(`语法检查通过: ${f}`);
  }
}

const htmlPath = path.join(root, 'index.html');
if (!fs.existsSync(htmlPath)) {
  console.error('缺少文件: index.html');
  failed = true;
} else {
  const html = fs.readFileSync(htmlPath, 'utf8');
  for (const ref of ['css/style.css', 'js/sweep.js', 'js/app.js']) {
    if (!html.includes(ref)) {
      console.error(`index.html 未引用 ${ref}`);
      failed = true;
    }
  }
}

for (const f of assets) {
  if (!fs.existsSync(path.join(root, f))) {
    console.error(`缺少文件: ${f}`);
    failed = true;
  }
}
if (failed) process.exit(1);

let outDir = path.join(root, 'dist');
try {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'js'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'css'), { recursive: true });
} catch (e) {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mural-dist-'));
  fs.mkdirSync(path.join(outDir, 'js'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'css'), { recursive: true });
}
for (const f of assets) {
  fs.copyFileSync(path.join(root, f), path.join(outDir, f));
}
console.log(`构建完成: ${outDir}（${assets.length} 个文件）`);
