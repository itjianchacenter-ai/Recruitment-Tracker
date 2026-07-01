// Build a PRECOMPILED standalone demo.html from the current src/App.jsx.
// Unlike make-demo.mjs (which ships raw JSX + babel-standalone and can hang
// on large files), this transpiles JSX -> JS with esbuild ahead of time, so
// the page renders instantly with just the React UMD globals. Reuses the same
// in-memory MOCK backend from make-demo.mjs to stay in sync.
//   node scripts/make-demo-compiled.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

// reuse the MOCKS block from make-demo.mjs verbatim (single source of truth)
const md = readFileSync('scripts/make-demo.mjs', 'utf8');
const m = md.match(/const MOCKS = `([\s\S]*?)`;/);
if (!m) { console.error('Could not find MOCKS in make-demo.mjs'); process.exit(1); }
const MOCKS = m[1];

let app = readFileSync('src/App.jsx', 'utf8');
app = app.replace(/[ \t]*import React[^\n]*\n/, '');
app = app.replace(/import \{[\s\S]*?\} from '\.\/lib\/supabase\.js';\n/, '');
app = app.replace(/\n?export default App;\s*$/, '\n');

const source = MOCKS + '\n' + app +
  '\nReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));\n';

const { code } = transformSync(source, { loader: 'jsx', jsx: 'transform' });

const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Recruitment 120 Days · Full Demo (ATS included)</title>
<script src="https://cdn.tailwindcss.com"></script>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
<script src="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js"></script>
<script>if(window.pdfjsLib)window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  body{font-family:'Noto Sans Thai',system-ui,sans-serif;background:#f1f5f9;margin:0}
  .ibtn{transition:all .12s ease}
</style>
</head>
<body>
<div id="root"></div>
<script>
${code}
</script>
</body>
</html>
`;

writeFileSync('demo.html', html, 'utf8');
console.log('wrote demo.html (precompiled) ·', html.length, 'chars');
