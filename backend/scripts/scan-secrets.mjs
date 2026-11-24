import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const skippedDirectories = new Set([
  '.git',
  '.next',
  '.prisma',
  'coverage',
  'dist',
  'generated',
  'node_modules',
  'var',
]);
const skippedFileNames = new Set([
  '.env',
  '.env.example',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);
const scannedExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.prisma',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);
const patterns = [
  { name: 'private key', expression: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
  { name: 'aws access key', expression: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: 'json web token',
    expression: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    name: 'assigned credential',
    expression:
      /\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)\b\s*[:=]\s*["'][^"'\s]{12,}["']/i,
  },
  {
    name: 'url credentials',
    expression: /\b[a-z][a-z\d+.-]*:\/\/[^\s:/]+:[^\s@/]+@/i,
  },
];
const allowlist = [
  /example|sample|placeholder|changeme|dummy|fixture|your[_-]?/i,
  /postgres:postgres@localhost/i,
  /peoplecore:peoplecore@postgres:5432/i,
  /pc_app:\.\.\.@postgres:5432/i,
  /minioadmin/i,
  /ci-(?:access|refresh|csrf)-secret/i,
];

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) files.push(...walk(path));
      continue;
    }
    if (entry.isFile()) files.push(path);
  }
  return files;
}

function shouldScan(path) {
  const name = path.split(/[\\/]/).pop() ?? '';
  const extension = name.includes('.') ? `.${name.split('.').pop()?.toLowerCase()}` : '';
  const normalized = relative(root, path).replace(/\\/g, '/');
  if (skippedFileNames.has(name) || name.startsWith('.env.')) return false;
  if (!scannedExtensions.has(extension)) return false;
  if (/(^|\/)(tests|test|fixtures|seeds)\//.test(normalized)) return false;
  if (/\.(spec|test)\.[^/]+$/.test(normalized)) return false;
  return true;
}

const files = walk(root).filter(shouldScan);
const findings = [];
for (const file of files) {
  const contents = readFileSync(file, 'utf8').split(/\r?\n/);
  for (let index = 0; index < contents.length; index += 1) {
    const line = contents[index] ?? '';
    if (allowlist.some((pattern) => pattern.test(line))) continue;
    for (const pattern of patterns) {
      if (pattern.expression.test(line)) {
        const location = `${relative(root, file).replace(/\\/g, '/')}:${index + 1}`;
        findings.push(`${location} ${pattern.name}`);
      }
    }
  }
}

if (findings.length > 0) {
  process.stderr.write(`Potential secrets found:\n${findings.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`Secret scan passed (${files.length} files).\n`);
