#!/usr/bin/env node
/**
 * 首屏注入的服务端半边：无头验证 zrBootStyleCss 的输出与落盘读取逻辑。
 * 背景（2026-11-28 真机实测）：宿主自己的 boot 主题会在首屏注入
 * body{background-color:#fff}，而我们的 token 要等客户端 bundle 求值后才生效，
 * 中间那 450ms 画布是白底 —— 用户看到的就是「白色界面 → 主题底色界面」。
 * 修法走宿主正规通道 webserver/index-inject（kind:'style'），本脚本钉住那条 CSS 的形状。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const mod = await import(pathToFileURL(join(root, 'index.js')).href)
const { zrBootStyleCss } = mod

let pass = 0
const ok = (name, cond, detail) => {
  if (cond) { console.log('ok    ' + name + (detail ? '（' + detail + '）' : '')); pass++ }
  else { console.error('FAIL  ' + name + (detail ? '（' + detail + '）' : '')); process.exitCode = 1 }
}

// 1) auto：跟系统，用媒体查询
{
  const css = zrBootStyleCss({ light: '#dee7e9', dark: '#101619', mode: 'auto' })
  ok('auto 用媒体查询', css.includes('@media(prefers-color-scheme:dark)'), css.length + ' 字符')
  ok('auto 浅色值在', css.includes('#dee7e9'))
  ok('auto 深色值在', css.includes('#101619'))
  ok('auto 不用 !important（靠特异性压过宿主 body 规则）', !css.includes('!important'))
  ok('选择器是 html body（特异性高于宿主的 body）', css.includes('html body{'))
}

// 2) 显式 light：不跟系统，只出一个颜色（否则系统是深色时会闪反方向）
{
  const css = zrBootStyleCss({ light: '#dee7e9', dark: '#101619', mode: 'light' })
  ok('显式 light 不带媒体查询', !css.includes('@media'), css.slice(0, 90))
  ok('显式 light 用浅色值', css.includes('#dee7e9') && !css.includes('#101619'))
}

// 3) 显式 dark
{
  const css = zrBootStyleCss({ light: '#dee7e9', dark: '#101619', mode: 'dark' })
  ok('显式 dark 不带媒体查询', !css.includes('@media'))
  ok('显式 dark 用深色值', css.includes('#101619') && !css.includes('#dee7e9'))
}

// 4) 非法输入退回内置 zhuoer 两态底色
{
  const css = zrBootStyleCss({ light: 'red', dark: 'javascript:x' })
  ok('非法值退回内置底色', css.includes('#f4f1ec') && css.includes('#0e1015'))
  const empty = zrBootStyleCss(null)
  ok('空输入不抛', typeof empty === 'string' && empty.length > 0)
}

// 5) 生成的 CSS 里不能出现 </style（会提前闭合 style 元素）
{
  const css = zrBootStyleCss({ light: '#dee7e9', dark: '#101619', mode: 'auto' })
  ok('不含 </style', !css.includes('</style'))
  ok('带可识别标记（页面侧探针靠它认出首屏行）', css.includes('dsh-zhuoer-boot-canvas'))
}

// 6) 服务端确实注册了 index-inject 监听（源码级）
{
  const src = readFileSync(join(root, 'index.js'), 'utf8')
  ok('注册了 webserver/index-inject', src.includes('webserver/index-inject'))
  ok('推的是 kind:style 行', /kind:\s*'style'/.test(src))
  ok('用了 prepend', /prepend:\s*true/.test(src))
}

console.log('OK    首屏注入：' + pass + ' 组断言通过（auto 媒体查询 / 显式单色 / 非法值兜底 / 形状与注册）')
