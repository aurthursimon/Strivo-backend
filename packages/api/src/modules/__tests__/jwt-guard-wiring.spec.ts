import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards against a real production incident: SupportChatModule, CommunityModule
// and SupportModule all declared `@UseGuards(JwtAuthGuard)` on their controller
// without importing JwtModule (directly, or transitively via a module that
// actually re-exports it) - JwtAuthGuard needs JwtService, so Nest's DI
// container throws UnknownDependenciesException and the whole process exits
// at boot, before any app code runs. No existing test compiles the real
// AppModule (that would need a live Postgres connection), so this class of
// wiring bug reached production undetected. This is a cheap, DB-free
// structural check instead: every controller using JwtAuthGuard must sit in a
// module that imports JwtModule somewhere in its own `imports` array.
const MODULES_ROOT = join(process.cwd(), 'src/modules');

function listModuleDirs(): string[] {
  return readdirSync(MODULES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function findFiles(dir: string, suffix: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => join(dir, entry.name));
}

describe('JwtAuthGuard module wiring', () => {
  for (const name of listModuleDirs()) {
    const dir = join(MODULES_ROOT, name);
    const controllerFiles = findFiles(dir, '.controller.ts');
    const moduleFiles = findFiles(dir, '.module.ts');

    for (const controllerFile of controllerFiles) {
      const source = readFileSync(controllerFile, 'utf8');
      if (!/@UseGuards\([^)]*\bJwtAuthGuard\b[^)]*\)/.test(source)) continue;

      it(`${controllerFile.replace(MODULES_ROOT, 'modules')} sits in a module importing JwtModule`, () => {
        expect(moduleFiles.length).toBeGreaterThan(0);
        const importsJwtModule = moduleFiles.some((moduleFile) =>
          readFileSync(moduleFile, 'utf8').includes('JwtModule'),
        );
        expect(importsJwtModule).toBe(true);
      });
    }
  }
});
