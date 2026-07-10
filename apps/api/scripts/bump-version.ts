/**
 * Roda no fluxo de merge dev -> main, antes do push na main.
 * Uso: npx ts-node scripts/bump-version.ts [--minor|--major]
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const VERSION_FILE = path.join(__dirname, '../src/version/version.data.ts');

function readCurrentVersion(): string {
  const content = fs.readFileSync(VERSION_FILE, 'utf-8');
  const match = content.match(/APP_VERSION = '([^']+)'/);
  if (!match) throw new Error('Não encontrei APP_VERSION em version.data.ts');
  return match[1];
}

function bump(version: string, kind: 'major' | 'minor' | 'patch'): string {
  const [major, minor, patch] = version.split('.').map(Number);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function getPendingCommitMessages(): string[] {
  try {
    const raw = execSync('git log origin/main..HEAD --oneline', { encoding: 'utf-8' }).trim();
    if (!raw) return [];
    return raw
      .split('\n')
      .map((line) => line.replace(/^[a-f0-9]+\s+/, ''))
      .map((line) => line.replace(/^[a-z]+\([^)]*\):\s*/i, '').replace(/^[a-z]+:\s*/i, ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function main() {
  const arg = process.argv[2];
  const kind: 'major' | 'minor' | 'patch' =
    arg === '--major' ? 'major' : arg === '--minor' ? 'minor' : 'patch';

  const currentVersion = readCurrentVersion();
  const newVersion = bump(currentVersion, kind);
  const changes = getPendingCommitMessages();
  const today = new Date().toISOString().slice(0, 10);

  const content = fs.readFileSync(VERSION_FILE, 'utf-8');
  const updated = content
    .replace(/APP_VERSION = '[^']+'/, `APP_VERSION = '${newVersion}'`)
    .replace(
      'export const CHANGELOG: ChangelogEntry[] = [',
      `export const CHANGELOG: ChangelogEntry[] = [\n  {\n    version: '${newVersion}',\n    date: '${today}',\n    changes: ${JSON.stringify(changes.length ? changes : ['Ajustes e correções'])},\n  },`,
    );

  fs.writeFileSync(VERSION_FILE, updated);
  console.log(`Versão atualizada: ${currentVersion} -> ${newVersion}`);
  console.log('Mudanças detectadas:', changes);
}

main();
