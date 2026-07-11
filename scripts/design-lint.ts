#!/usr/bin/env tsx
/**
 * U1-04 — Lint de design
 * Proíbe uso de valores mágicos de cor/raio/sombra fora do token system.
 * Roda via: npm run lint:design
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');

// Arquivos shadcn de terceiros — não alteramos, não lintamos
const SHADCN_SKIP = new Set([
  'avatar.tsx', 'badge.tsx', 'button.tsx', 'card.tsx', 'chart.tsx',
  'dialog.tsx', 'dropdown-menu.tsx', 'input.tsx', 'label.tsx',
  'scroll-area.tsx', 'select.tsx', 'sonner.tsx', 'switch.tsx',
  'table.tsx', 'tabs.tsx', 'textarea.tsx', 'tooltip.tsx',
]);

function isShipped(filePath: string): boolean {
  const base = path.basename(filePath);
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  // index.css: hex aqui SÃO tokens — não lintar
  if (base === 'index.css') return true;
  // shadcn primitivos
  if (rel.startsWith('components/ui/') && SHADCN_SKIP.has(base)) return true;
  // testes
  if (base.endsWith('.test.tsx') || base.endsWith('.test.ts')) return true;
  return false;
}

interface Rule {
  name: string;
  pattern: RegExp;
  message: string;
  severity: 'error' | 'warn';
}

const RULES: Rule[] = [
  {
    name: 'no-tailwind-arbitrary-hex',
    // Captura: text-[#abc], bg-[#123456], border-[#ffffff88], etc.
    pattern: /\[#[0-9a-fA-F]{3,8}\]/g,
    message: 'Hex Tailwind arbitrário — use token astrum (ex: text-astrum-signal, bg-astrum-red)',
    severity: 'error',
  },
  {
    name: 'no-arbitrary-radius-px',
    // Captura: rounded-[6px], rounded-[1.5px]
    pattern: /rounded-\[[\d.]+px\]/g,
    message: 'Raio fixo em px — use rounded-stable-xs/sm/md/lg/xl (tokens U1-02)',
    severity: 'error',
  },
  {
    name: 'no-raw-tailwind-shadow',
    // Captura shadow-sm/md/lg/xl/2xl fora dos primitivos — prefira tokens semânticos
    pattern: /\bshadow-(sm|md|lg|xl|2xl)\b/g,
    message: 'Shadow Tailwind genérico — prefira shadow-1/2/3/4 (tokens semânticos U1-02)',
    severity: 'warn',
  },
  {
    name: 'no-primary-as-risk',
    // --primary no dark é vermelho (C4); var(--primary) direto em componentes é perigoso
    pattern: /var\(--primary\)/g,
    message: 'var(--primary) direto — no dark mode é vermelho; use var(--color-astrum-fiber) para acento tecnológico',
    severity: 'warn',
  },
];

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (/\.(tsx|ts|css)$/.test(entry.name)) {
      yield full;
    }
  }
}

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

let totalErrors = 0;
let totalWarnings = 0;

for (const file of walk(ROOT)) {
  if (isShipped(file)) continue;

  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');

  for (const rule of RULES) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      rule.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = rule.pattern.exec(line)) !== null) {
        const isError = rule.severity === 'error';
        const prefix = isError
          ? `${RED}${BOLD}error${RESET}`
          : `${YELLOW}${BOLD}warn${RESET}`;
        const loc = `${BOLD}${rel}:${i + 1}${RESET}`;
        console.log(`${prefix}  ${loc}  ${DIM}[${rule.name}]${RESET}`);
        console.log(`       ${rule.message}`);
        console.log(`       ${DIM}${line.trim()}${RESET}`);
        console.log('');
        if (isError) totalErrors++;
        else totalWarnings++;
      }
    }
  }
}

const summary =
  `Design lint: ${BOLD}${totalErrors > 0 ? RED : ''}${totalErrors} error(s)${RESET}` +
  `, ${BOLD}${totalWarnings > 0 ? YELLOW : ''}${totalWarnings} warning(s)${RESET}`;

console.log(summary);

if (totalErrors > 0) {
  process.exit(1);
}
