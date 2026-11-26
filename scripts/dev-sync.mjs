#!/usr/bin/env node
// dev-sync: rebuild and push the built plugin files into the installed profile copy,
// so you can preview source changes WITHOUT switching the profile back to a link: install.
// Usage: node scripts/dev-sync.mjs [--no-build] [--watch] [--profile <name>] [--dir <dir>]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, mkdirSync, statSync, watch } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const home = process.env.DSH_HOME || join(homedir(), '.dsh');
const profile = opt('--profile', process.env.DSH_PROFILE || 'desktop');
const target = opt('--dir', join(home, 'profiles', profile, 'node_modules', 'dsh-zhuoer-theme'));

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12);
const FILES = ['client.js', 'index.js', 'theme-gen.js', 'theme-tool.js', 'cordis.patch.yml', 'icon.svg'];
const DIRS = ['locale', 'assets'];

function build() {
  process.stdout.write('[dev-sync] build... ');
  execFileSync(process.execPath, [join(repo, 'build.mjs')], { cwd: repo, stdio: 'inherit' });
  console.log('ok');
}

function plan() {
  if (!existsSync(join(target, 'package.json'))) {
    console.error('[dev-sync] installed package not found at ' + target);
    console.error('[dev-sync] install it from the plugin market (or pass --dir/--profile) and retry.');
    return false;
  }
  console.log('[dev-sync] would write into: ' + target);
  for (const f of FILES) { if (existsSync(join(repo, f))) console.log('  - ' + f); }
  for (const d of DIRS) { if (existsSync(join(repo, d))) console.log('  - ' + d + '/'); }
  return true;
}

function sync() {
  if (!existsSync(join(target, 'package.json'))) {
    console.error('[dev-sync] installed package not found at ' + target);
    console.error('[dev-sync] install it from the plugin market (or pass --dir/--profile) and retry.');
    return false;
  }
  const copied = [];
  for (const f of FILES) {
    const src = join(repo, f);
    if (!existsSync(src)) continue;
    cpSync(src, join(target, f));
    copied.push(f + ' ' + sha(src));
  }
  for (const d of DIRS) {
    const src = join(repo, d);
    if (!existsSync(src)) continue;
    mkdirSync(join(target, d), { recursive: true });
    cpSync(src, join(target, d), { recursive: true });
    copied.push(d + '/');
  }
  const stamp = new Date().toISOString().slice(11, 19);
  console.log('[' + stamp + '] synced -> ' + copied.join(', '));
  return true;
}

// 默认只预览：dev:sync 会覆盖已安装目录（那是你在跑的插件），默认不动它。
// 真要写：node scripts/dev-sync.mjs --apply
const apply = flag('--apply');
if (!flag('--no-build')) build();
if (!plan()) process.exit(2);
if (!apply) {
  console.log('[dev-sync] 预览模式（未写入）。加 --apply 才会覆盖已安装目录。');
  process.exit(0);
}
if (!sync()) process.exit(2);
console.log('[dev-sync] target: ' + target);
console.log('[dev-sync] next: press the refresh button (dsh-unlag) to swap the client bundle;');
console.log('[dev-sync]       index.js / cordis.patch.yml changes need a plugin reload or an app restart.');

if (flag('--watch')) {
  let timer = null;
  let running = false;
  let dirty = false;
  const run = () => {
    if (running) { dirty = true; return; }
    running = true;
    try {
      build();
      sync();
      console.log('[dev-sync] press refresh (unlag button) to see client.js changes.');
    } catch (e) {
      console.error('[dev-sync] build failed: ' + (e && e.message ? e.message : e));
    } finally {
      running = false;
      if (dirty) { dirty = false; timer = setTimeout(run, 50); }
    }
  };
  const schedule = (file) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (file) console.log('[dev-sync] changed: ' + relative(repo, file));
      run();
    }, 180);
  };
  const roots = [join(repo, 'src'), join(repo, 'build.mjs')].filter(existsSync);
  for (const root of roots) {
    const isDir = statSync(root).isDirectory();
    watch(root, { recursive: isDir }, (_evt, file) => schedule(file ? join(isDir ? root : repo, file) : root));
  }
  console.log('[dev-sync] watching ' + roots.map((r) => relative(repo, r)).join(', ') + ' — Ctrl+C to stop');
}
