import { exec as _exec } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const TREE = [
  'src/components/component_one.dart',
  'src/components/component_two.dart',
  'src/components/component_two.freezed.dart',
  'src/components/component_three.dart',
  'src/components/component_three.g.dart',
  'src/components/nested/component_one.dart',
  'src/components/nested/component_two.dart',
  'src/components/nested/component_three.dart',
  'src/empty',
  'src/main.dart',
  'lib/main.dart',
  'lib/component.dart'
];

const TMP_DIR = join(os.tmpdir(), 'dbf-cli');
const SRC_DIR = join(TMP_DIR, 'src');
const LIB_DIR = join(TMP_DIR, 'lib');
// const EMPTY_DIR = join(SRC_DIR, 'empty');
const COMPONENTS_DIR = join(SRC_DIR, 'components');
const NESTED_DIR = join(COMPONENTS_DIR, 'nested');

const COMPLEX_ARGS = Object.entries({
  '--exclude-freezed': true,
  '--exclude-generated': true,
  '--excluded-files': '*_one.dart',
  '-n': 'complex'
}).reduce((agg, [arg, value]) => `${agg} ${value === true ? arg : `${arg} ${value}`}`, '').trim();

const exec = promisify(_exec);

const getOptionTitle = (dir: string, option?: string, args?: string) => `${dir.replace(os.tmpdir(), '')} ${option ?? ''} ${args ?? ''}`.trim();

// Helper to get all barrel files when using recursive mode
const getAllBarrelFiles = async (startDir: string): Promise<string[]> => {
  const result: string[] = [];
  const stack = [startDir];

  while (stack.length > 0) {
    const currentDir = stack.pop()!;
    const files = readdirSync(currentDir, { withFileTypes: true });

    for (const file of files) {
      const fullPath = join(currentDir, file.name);
      if (file.isDirectory()) {
        stack.push(fullPath);
      } else if (!TREE.includes(fullPath.replace(TMP_DIR, '').slice(1))) {
        result.push(fullPath);
      }
    }
  }

  return result;
};

beforeEach(async () => {
  await Promise.all(TREE.map(async (filePath) => {
    const fullPath = join(TMP_DIR, filePath);
    await mkdir(dirname(fullPath), { recursive: true });
    return writeFile(fullPath, '', { flag: 'w' });
  }));
});

afterEach(async () => {
  if (existsSync(TMP_DIR)) {
    await rm(TMP_DIR, { force: true, recursive: true });
  }
});

describe('dbf-cli', () => {
  describe.each(['--regular', '--recursive', '--subfolders'])('%s', (genType) => {
    const type = genType === '--regular' ? ' ' : ` ${genType} `;

    [
      { dir: SRC_DIR, out: 'src.dart' },
      { dir: COMPONENTS_DIR, out: 'components.dart' },
      { dir: NESTED_DIR, out: 'nested.dart' }
    ].forEach(({ dir, out }) => {
      it(getOptionTitle(dir), async () => {
        await exec(`bun ./src/bin.ts${type}${dir}`);

        if (genType === '--recursive') {
          // For recursive, we need to check all generated barrel files
          const barrelFiles = await getAllBarrelFiles(dir);
          expect(barrelFiles.length).toBeGreaterThan(0);

          for (const file of barrelFiles) {
            expect(await readFile(file, 'utf-8')).toMatchSnapshot(file.replace(TMP_DIR, ''));
          }
        } else {
          // For regular and subfolders modes, check only the expected output file
          expect(await readFile(join(dir, out), 'utf-8')).toMatchSnapshot();
        }
      });
    });

    [
      { args: 'out', dir: COMPONENTS_DIR, option: '-n', out: 'out.dart' },
      { args: 'main.dart', dir: SRC_DIR, option: '--excluded-files', out: 'src.dart' },
      { dir: COMPONENTS_DIR, option: '--exclude-freezed', out: 'components.dart' },
      { dir: COMPONENTS_DIR, option: '--exclude-generated', out: 'components.dart' },
      { dir: COMPONENTS_DIR, option: '--append-folder-name', out: 'components_components.dart' },
      { dir: COMPONENTS_DIR, option: '--prepend-folder-name', out: 'components_components.dart' },
      { dir: LIB_DIR, option: '--prepend-package', out: 'lib.dart' }
    ].forEach(({ args, dir, option, out }) => {
      it(getOptionTitle(dir, option, args), async () => {
        await exec(`bun ./src/bin.ts${type}${dir} ${option}${args ? ` ${args}` : ''}`);

        if (genType === '--recursive') {
          // For recursive, check all generated barrel files
          const barrelFiles = await getAllBarrelFiles(dir);
          expect(barrelFiles.length).toBeGreaterThan(0);

          for (const file of barrelFiles) {
            expect(await readFile(file, 'utf-8')).toMatchSnapshot(file.replace(TMP_DIR, ''));
          }
        } else {
          // For regular and subfolders, check only the expected output file
          expect(await readFile(join(dir, out), 'utf-8')).toMatchSnapshot();
        }
      });
    });

    it(`runs a complex example (${COMPLEX_ARGS})`, async () => {
      await exec(`bun ./src/bin.ts${type}${COMPONENTS_DIR} ${COMPLEX_ARGS}`);

      if (genType === '--recursive') {
        // For recursive, we need to check all generated files
        const barrelFiles = await getAllBarrelFiles(COMPONENTS_DIR);
        expect(barrelFiles.length).toBeGreaterThan(0);

        for (const file of barrelFiles) {
          expect(await readFile(file, 'utf-8')).toMatchSnapshot(file.replace(TMP_DIR, ''));
        }
      } else {
        expect(await readFile(join(COMPONENTS_DIR, 'complex.dart'), 'utf-8')).toMatchSnapshot();
      }
    });
  });
});
