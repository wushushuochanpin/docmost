import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { marked } = require('marked');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const materialDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(materialDir, '../../..');
const generatedDir = path.join(materialDir, 'generated');

const softwareName = 'SuperChat 知识协作管理系统';
const version = 'V1.0';
const copyrightOwner = '鲜知（北京）科技有限公司';
const codeBaseName = `${softwareName}_${version}_程序鉴别材料`;
const safeCodeBaseName = codeBaseName.replace(/\s+/g, '_');

fs.mkdirSync(generatedDir, { recursive: true });

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function chromiumPath() {
  const candidates = ['chromium-browser', 'chromium', '/snap/bin/chromium', 'google-chrome'];
  for (const candidate of candidates) {
    try {
      execFileSync('bash', ['-lc', `command -v ${candidate}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return candidate;
    } catch {
      // continue
    }
  }
  throw new Error('未找到 Chromium / Chrome，无法生成 PDF。');
}

function htmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fileComment(pathname) {
  if (pathname.endsWith('.css') || pathname.endsWith('.scss')) {
    return `/* 文件: ${pathname} */`;
  }
  return `// 文件: ${pathname}`;
}

function collectSourceLines() {
  const output = run('git', [
    'ls-files',
    'apps/client/src/**',
    'apps/server/src/**',
    'packages/editor-ext/src/**',
  ]);

  const files = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => /\.(ts|tsx|js|jsx|css|scss|mjs|cjs)$/.test(file))
    .filter((file) => !file.includes('/dist/'))
    .filter((file) => !file.includes('/src/ee/'))
    .sort();

  const includedFiles = [];
  const lines = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    if (content.includes('@/ee/') || content.includes('@docmost/ee/')) {
      continue;
    }
    includedFiles.push(file);
    lines.push(fileComment(file));
    const fileLines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    for (const line of fileLines) {
      lines.push(line.length ? line : ' ');
    }
  }

  return { files: includedFiles, lines };
}

function paginate(lines) {
  const pageSize = 50;
  const pageCount = 60;
  const required = pageSize * pageCount;
  const selected =
    lines.length > required
      ? [...lines.slice(0, pageSize * 30), ...lines.slice(-pageSize * 30)]
      : lines;

  const pages = [];
  for (let index = 0; index < selected.length; index += pageSize) {
    pages.push(selected.slice(index, index + pageSize));
  }
  return pages;
}

function renderSourceMaterial() {
  const { files, lines } = collectSourceLines();
  const pages = paginate(lines);
  const textPath = path.join(generatedDir, `${safeCodeBaseName}.txt`);
  const htmlPath = path.join(generatedDir, `${safeCodeBaseName}.html`);
  const pdfPath = path.join(generatedDir, `${safeCodeBaseName}.pdf`);

  const textBlocks = pages.map((page, pageIndex) => {
    const start = pageIndex * 50 + 1;
    const rows = page.map((line, index) => `${String(start + index).padStart(4, '0')}: ${line}`);
    return [`${softwareName} ${version} 程序鉴别材料 第 ${pageIndex + 1} 页`, ...rows].join('\n');
  });
  fs.writeFileSync(textPath, textBlocks.join('\n\n'), 'utf8');

  const pageHtml = pages
    .map((page, pageIndex) => {
      const rows = page
        .map((line, index) => {
          const lineNo = pageIndex * 50 + index + 1;
          return `<div class="code-line"><span class="line-no">${String(lineNo).padStart(4, '0')}</span><span class="code">${htmlEscape(line)}</span></div>`;
        })
        .join('');
      return `
        <section class="page">
          <header>
            <div>${htmlEscape(softwareName)} ${htmlEscape(version)} 程序鉴别材料</div>
            <div>${htmlEscape(copyrightOwner)} | 第 ${pageIndex + 1} 页</div>
          </header>
          <pre>${rows}</pre>
        </section>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${htmlEscape(softwareName)} ${htmlEscape(version)} 程序鉴别材料</title>
  <style>
    @page { size: A4; margin: 12mm 10mm; }
    body { margin: 0; color: #111; font-family: "Noto Sans Mono CJK SC", "Source Code Pro", Consolas, monospace; }
    .page { break-after: page; page-break-after: always; }
    .page:last-child { break-after: auto; page-break-after: auto; }
    header { display: flex; justify-content: space-between; align-items: center; font-family: "Noto Sans CJK SC", Arial, sans-serif; font-size: 9px; border-bottom: 1px solid #444; padding-bottom: 4px; margin-bottom: 5px; }
    pre { margin: 0; white-space: pre; font-size: 7.5px; line-height: 10.3px; }
    .code-line { display: block; height: 10.3px; }
    .line-no { display: inline-block; width: 34px; color: #666; user-select: none; }
    .code { white-space: pre; }
  </style>
</head>
<body>
${pageHtml}
</body>
</html>`;

  fs.writeFileSync(htmlPath, html, 'utf8');
  printToPdf(htmlPath, pdfPath);

  return { files: files.length, lines: lines.length, pages: pages.length, textPath, htmlPath, pdfPath };
}

function mdToHtml(markdownPath) {
  const markdown = fs.readFileSync(markdownPath, 'utf8');
  const title = path.basename(markdownPath, '.md');
  const body = marked.parse(markdown);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${htmlEscape(title)}</title>
  <style>
    @page { size: A4; margin: 16mm 14mm; }
    body { font-family: "Noto Sans CJK SC", "Microsoft YaHei", Arial, sans-serif; color: #111; font-size: 12px; line-height: 1.65; }
    h1 { font-size: 22px; margin: 0 0 12px; }
    h2 { font-size: 17px; margin: 22px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    h3 { font-size: 14px; margin: 16px 0 6px; }
    p { margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; table-layout: fixed; }
    th, td { border: 1px solid #bbb; padding: 5px 6px; vertical-align: top; word-break: break-word; }
    th { background: #f3f4f6; }
    code { font-family: Consolas, monospace; font-size: 11px; }
    pre { background: #f6f8fa; padding: 8px; white-space: pre-wrap; word-break: break-word; }
    blockquote { border-left: 3px solid #999; margin: 8px 0; padding: 4px 10px; color: #333; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function printToPdf(htmlPath, pdfPath) {
  const chromium = chromiumPath();
  execFileSync(chromium, [
    '--headless',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    `--print-to-pdf=${pdfPath}`,
    `file://${htmlPath}`,
  ], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function renderMarkdownPdfs() {
  const markdownFiles = [
    'README.md',
    '01_申请表填写卡.md',
    '02_软件说明书.md',
    '03_源代码材料说明.md',
    '04_开源许可与二次开发说明.md',
    '05_软件名称说明.md',
    '06_待补资料清单.md',
    '07_参考依据与经验要点.md',
  ];

  const outputs = [];
  for (const file of markdownFiles) {
    const markdownPath = path.join(materialDir, file);
    const base = path.basename(file, '.md');
    const htmlPath = path.join(generatedDir, `${base}.html`);
    const pdfPath = path.join(generatedDir, `${base}.pdf`);
    fs.writeFileSync(htmlPath, mdToHtml(markdownPath), 'utf8');
    printToPdf(htmlPath, pdfPath);
    outputs.push(pdfPath);
  }
  return outputs;
}

const sourceResult = renderSourceMaterial();
const markdownPdfs = renderMarkdownPdfs();

console.log(JSON.stringify({
  generatedDir,
  source: sourceResult,
  markdownPdfs,
}, null, 2));
