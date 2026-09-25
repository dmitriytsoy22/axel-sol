import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const frontend = path.resolve(__dirname, '../..');
const src = path.join(frontend, 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return name === '__tests__' ? [] : sourceFiles(file);
    return /\.(tsx?|css)$/.test(name) ? [file] : [];
  });
}

function resolveCss(specifier: string): string {
  if (specifier.startsWith('@/')) return path.join(src, specifier.slice(2));
  return path.join(frontend, 'node_modules', specifier);
}

const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('fonts', () => {
  const files = sourceFiles(src);

  it('never load from Google Fonts in source code', () => {
    const offenders = files.filter((file) =>
      /next\/font\/google|fonts\.googleapis\.com/.test(
        file.endsWith('.css') ? withoutComments(readFileSync(file, 'utf8')) : readFileSync(file, 'utf8'),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it('never load remotely from a stylesheet the app imports, including third-party ones', () => {
    const imported = files.flatMap((file) =>
      Array.from(readFileSync(file, 'utf8').matchAll(/import\s+'([^']+\.css)'/g), (m) => m[1]),
    );
    const remote = imported.filter((specifier) =>
      /@import\s+url\(\s*['"]?https?:/.test(withoutComments(readFileSync(resolveCss(specifier), 'utf8'))),
    );

    expect(imported).toContain('@/styles/wallet-modal.css');
    expect(remote).toEqual([]);
  });
});
