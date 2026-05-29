import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('preview.html', 'utf8');

const startTag = '<script type="text/babel" data-presets="react">';
const start = html.indexOf(startTag);
if (start < 0) throw new Error('start tag not found');
const bodyStart = start + startTag.length;
const end = html.indexOf('</script>', bodyStart);
if (end < 0) throw new Error('end script tag not found');

let body = html.slice(bodyStart, end);

// 1) React destructure -> ESM imports (React default for React.Fragment) + supabase
const destructure = 'const { useState, useEffect, useMemo, useRef, useCallback } = React;';
if (!body.includes(destructure)) throw new Error('React destructure line not found');
const header =
`import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  listCandidates, createCandidate, updateCandidate, deleteCandidate,
  subscribeCandidates, signIn, signOut, getSession, onAuthChange,
  actorFromSession, roleFromSession
} from './lib/supabase.js';

// ---------------------------------------------------------------------------
// Row <-> model mapping (DB uses snake_case; cowork components use camelCase
// for generatedDocs / approvalWorkflows). Everything else shares names.
// ---------------------------------------------------------------------------
function fromRow(r) {
  return { ...r, generatedDocs: r.generated_docs ?? {}, approvalWorkflows: r.approval_workflows ?? {} };
}
function toRow(c) {
  return {
    name: c.name ?? null,
    position: c.position,
    department: c.department,
    type: c.type,
    process_start_date: c.process_start_date,
    current_step: c.current_step,
    status: c.status,
    steps: c.steps ?? [],
    documents: c.documents ?? [],
    probation: c.probation ?? {},
    shortlist: c.shortlist ?? [],
    generated_docs: c.generatedDocs ?? c.generated_docs ?? {},
    approval_workflows: c.approvalWorkflows ?? c.approval_workflows ?? {},
    distributions: c.distributions ?? {},
    files: c.files ?? [],
    notes: c.notes ?? null,
    created_by: c.created_by ?? null
  };
}`;
body = body.replace(destructure, header);

// 2) Hardcoded preview date -> real today
const dateBlock = `const TODAY = '2026-05-22';
    const today = () => TODAY;`;
if (!body.includes(dateBlock)) throw new Error('TODAY date block not found');
body = body.replace(dateBlock,
`const today = () => new Date().toISOString().slice(0, 10);
    const TODAY = today();`);

// 3) Remove the browser render call
const renderLine = "ReactDOM.createRoot(document.getElementById('root')).render(<App />);";
if (!body.includes(renderLine)) throw new Error('ReactDOM render line not found');
body = body.replace(renderLine, '');

// 4) Trim + export
body = body.replace(/\s+$/,'') + '\n\nexport default App;\n';

writeFileSync('src/App.jsx', body, 'utf8');
console.log('Wrote src/App.jsx · length', body.length);
