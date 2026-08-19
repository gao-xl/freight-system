// 临时脚本：收集项目中实际使用的 Element Plus 图标白名单
// 用法: node scripts/collect-icons.js
const fs = require('fs');
const path = require('path');
const icons = require('@element-plus/icons-vue');

const iconNames = new Set(Object.keys(icons));

const srcDir = path.resolve(__dirname, '../src');
const files = [];
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(vue|js)$/.test(f)) files.push(p);
  }
}
walk(srcDir);

const used = new Set();
const reTag = /<([A-Z][A-Za-z0-9]*)/g;
const reIs = /:is="['"]?([A-Z][A-Za-z0-9]*)['"]?/g;
const reIconMeta = /icon:\s*['"]([A-Za-z0-9]+)['"]/g;
for (const f of files) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const m of txt.matchAll(reTag)) used.add(m[1]);
  for (const m of txt.matchAll(reIs)) used.add(m[1]);
  for (const m of txt.matchAll(reIconMeta)) used.add(m[1]);
}

const matched = [...used].filter((n) => iconNames.has(n)).sort();
console.log('实际使用图标数:', matched.length, '/', iconNames.size);
console.log(JSON.stringify(matched, null, 0));
