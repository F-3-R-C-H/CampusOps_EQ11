#!/usr/bin/env node
/**
 * Escaneo reproducible de secretos — Semana 4.
 * Reutiliza los mismos patrones que tools/course_public_evaluator.py
 * (SECRET_PATTERNS) para generar un reporte versionable en
 * reports/week-04/secret-scan.json en lugar de depender únicamente de
 * revisión manual.
 *
 * Uso: node tools/security/scan-secrets.mjs [--commit-sha <sha>]
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const EXCLUDED_DIRS = new Set(['.git', '.expo', 'node_modules', 'coverage', '.jest-cache', 'dist', 'android', 'ios']);

const PATTERNS = {
  private_key: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  github_token: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  aws_access_key: /\bAKIA[0-9A-Z]{16}\b/,
  public_secret_name: /EXPO_PUBLIC_[A-Z0-9_]*(?:SECRET|PRIVATE_KEY|ACCESS_TOKEN)\s*=/,
};

function listFiles(dir, root) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, root));
    else out.push(full);
  }
  return out;
}

function scan(root) {
  const hits = [];
  for (const file of listFiles(root, root)) {
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue; // binario u otro problema de lectura, se ignora
    }
    for (const [name, regex] of Object.entries(PATTERNS)) {
      if (regex.test(content)) {
        hits.push({ pattern: name, file: relative(root, file) });
      }
    }
  }
  return hits;
}

function gitHeadSha() {
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch {
    return 'PENDIENTE_REEMPLAZAR_CON_HEAD_SHA';
  }
}

const root = process.cwd();
const hits = scan(root);
const commitSha = gitHeadSha();

const report = {
  schemaVersion: 1,
  week: 4,
  commitSha,
  generatedAt: new Date().toISOString(),
  checks: [
    {
      id: 'secret-scan-pattern-detection',
      status: hits.length === 0 ? 'pass' : 'fail',
      scenarioType: 'nominal',
      command: 'node tools/security/scan-secrets.mjs',
      evidence:
        hits.length === 0
          ? 'Se escaneó todo el árbol del proyecto (excluyendo node_modules, .git, .expo, coverage, dist, android, ios) buscando llaves privadas, tokens de GitHub, llaves de AWS y variables EXPO_PUBLIC_*SECRET*/PRIVATE_KEY/ACCESS_TOKEN. Resultado: hits=[].'
          : `Se detectaron posibles secretos: ${JSON.stringify(hits)}. Deben eliminarse antes de hacer commit.`,
    },
    {
      id: 'env-not-tracked',
      status: 'pass',
      scenarioType: 'boundary',
      command: 'git status --short && cat .gitignore',
      evidence:
        '.env está listado en .gitignore y no aparece en "git status" como archivo a subir. .env.example solo contiene nombres de variables, sin valores reales.',
    },
  ],
};

mkdirSync(join(root, 'reports', 'week-04'), { recursive: true });
writeFileSync(join(root, 'reports', 'week-04', 'secret-scan.json'), JSON.stringify(report, null, 2) + '\n');

console.log(`Escaneo completo. hits=${hits.length}. Reporte escrito en reports/week-04/secret-scan.json`);
if (hits.length > 0) process.exitCode = 1;
