#!/usr/bin/env node
// Generates workspace_demo/PRD.pdf — a hand-rolled multi-page PDF with the
// Tasklet product requirements doc. No deps; uses the built-in Helvetica font.
// Run: node scripts/make-prd.mjs

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'PRD.pdf');

// Page content as { heading?: string, body: string[] } — body is an array of
// paragraphs (themselves an array of lines). Each line becomes a Tj operator.
const PAGES = [
  {
    heading: 'Tasklet — Product Requirements Document',
    body: [
      ['Version 0.1   |   Author: Product   |   Status: Draft'],
      [
        'Tasklet is a single-user task tracking app intended to demo the',
        'WorkspaceAI shell. It is intentionally minimal: a list of tasks',
        'with add, complete, and delete operations, plus filtering by',
        'completion state. The aim is to be small enough to read end to',
        'end in a single sitting, but realistic enough that a viewer can',
        'imagine extending it.',
      ],
      [
        'This document captures the goals, requirements, and milestones',
        'for the first cut. It is the source of truth for what version',
        '0.1 must do. Future versions will live in their own PRDs.',
      ],
    ],
  },
  {
    heading: '1. Goals and Non-Goals',
    body: [
      ['Goals'],
      [
        '- Demonstrate end-to-end CRUD through a small typed API.',
        '- Provide a recognizable UX (todo-app shape) so reviewers can',
        '  evaluate code quality without learning a new product first.',
        '- Keep the codebase under ~500 lines so it fits comfortably in',
        '  a review session.',
      ],
      ['Non-goals'],
      [
        '- Authentication, multi-user support, or sharing.',
        '- Persistence beyond process lifetime. The store is in-memory.',
        '- Mobile-specific layouts. Desktop browsers only.',
      ],
    ],
  },
  {
    heading: '2. Functional Requirements',
    body: [
      ['F1. List tasks'],
      [
        'The home screen displays all tasks in creation order. Each row',
        'shows the title, a completion checkbox, and a delete button.',
        'Completed tasks render with a strikethrough.',
      ],
      ['F2. Create task'],
      [
        'A single-line input above the list accepts a task title. Empty',
        'titles are rejected. On submit, the task is appended and the',
        'input is cleared. The API returns the created task and the UI',
        'inserts it without a refetch.',
      ],
      ['F3. Toggle completion'],
      [
        'Clicking the checkbox toggles the completed flag on the server',
        'and updates the row in place. Failure surfaces an inline error.',
      ],
      ['F4. Delete task'],
      [
        'Clicking the delete button removes the task immediately. There',
        'is no undo in v0.1.',
      ],
      ['F5. Filter by status'],
      [
        'Three tabs above the list — All, Active, Done — restrict which',
        'tasks are shown. The selection is local UI state; it does not',
        'persist across reloads.',
      ],
    ],
  },
  {
    heading: '3. Non-Functional Requirements',
    body: [
      ['Performance'],
      [
        'All operations complete in under 100 ms on localhost. The UI',
        'never blocks on a network call longer than 500 ms without a',
        'loading indicator.',
      ],
      ['Reliability'],
      [
        'API errors are caught and shown inline. The frontend never',
        'leaves the user in an empty broken state — at minimum, the',
        'last-known good list is rendered with an error banner.',
      ],
      ['Code quality'],
      [
        'TypeScript strict mode is on for both projects. There are no',
        'any types. Components are < 100 lines each. The backend has',
        'no global mutable state outside the in-memory store.',
      ],
    ],
  },
  {
    heading: '4. Milestones',
    body: [
      ['M1 — API skeleton'],
      [
        'Express app with health and tasks routes, in-memory store, and',
        'request logging. Manually verified with curl.',
      ],
      ['M2 — UI skeleton'],
      [
        'React app with the three components: NewTaskForm, FilterBar,',
        'TaskList. Wired to the backend via a small fetch wrapper.',
      ],
      ['M3 — Polish'],
      [
        'Error states, empty states, basic styling, README updates. At',
        'this point the demo is ready to show.',
      ],
      ['Out of scope for v0.1'],
      [
        'Drag-to-reorder, due dates, tags, search, keyboard shortcuts,',
        'a real database, deployment.',
      ],
    ],
  },
];

// ---------- PDF generation ----------

const PAGE_WIDTH = 612; // 8.5"
const PAGE_HEIGHT = 792; // 11"
const MARGIN_X = 72;
const MARGIN_TOP = 720;
const LINE_HEIGHT = 16;
const HEADING_SIZE = 16;
const BODY_SIZE = 11;

function escapePdfString(s) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPageStream(page) {
  const ops = [];
  let y = MARGIN_TOP;

  if (page.heading) {
    ops.push('BT');
    ops.push(`/F2 ${HEADING_SIZE} Tf`);
    ops.push(`${MARGIN_X} ${y} Td`);
    ops.push(`(${escapePdfString(page.heading)}) Tj`);
    ops.push('ET');
    y -= LINE_HEIGHT * 2;
  }

  for (const paragraph of page.body) {
    ops.push('BT');
    ops.push(`/F1 ${BODY_SIZE} Tf`);
    ops.push(`${MARGIN_X} ${y} Td`);
    for (let i = 0; i < paragraph.length; i++) {
      ops.push(`(${escapePdfString(paragraph[i])}) Tj`);
      if (i < paragraph.length - 1) ops.push(`0 -${LINE_HEIGHT} Td`);
    }
    ops.push('ET');
    y -= LINE_HEIGHT * (paragraph.length + 1);
  }

  return ops.join('\n');
}

// Build objects.
// 1: Catalog, 2: Pages, 3..: page + content + fonts
const objects = [];
function addObject(body) {
  objects.push(body);
  return objects.length; // 1-indexed
}

const catalogIdPlaceholder = 1;
const pagesIdPlaceholder = 2;
objects.push(null); // reserve 1
objects.push(null); // reserve 2

const fontF1 = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
const fontF2 = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

const pageIds = [];
for (const page of PAGES) {
  const stream = buildPageStream(page);
  const contentId = addObject(
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
  );
  const pageId = addObject(
    `<< /Type /Page /Parent ${pagesIdPlaceholder} 0 R ` +
      `/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Contents ${contentId} 0 R ` +
      `/Resources << /Font << /F1 ${fontF1} 0 R /F2 ${fontF2} 0 R >> >> >>`,
  );
  pageIds.push(pageId);
}

objects[pagesIdPlaceholder - 1] =
  `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
objects[catalogIdPlaceholder - 1] = `<< /Type /Catalog /Pages ${pagesIdPlaceholder} 0 R >>`;

// Serialize.
let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
const offsets = [];
for (let i = 0; i < objects.length; i++) {
  offsets.push(Buffer.byteLength(out, 'latin1'));
  out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
}

const xrefOffset = Buffer.byteLength(out, 'latin1');
out += `xref\n0 ${objects.length + 1}\n`;
out += '0000000000 65535 f \n';
for (const off of offsets) {
  out += `${String(off).padStart(10, '0')} 00000 n \n`;
}
out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogIdPlaceholder} 0 R >>\n`;
out += `startxref\n${xrefOffset}\n%%EOF\n`;

writeFileSync(OUT, out, 'latin1');
// eslint-disable-next-line no-console
console.log(`Wrote ${OUT} (${Buffer.byteLength(out, 'latin1')} bytes, ${PAGES.length} pages)`);
