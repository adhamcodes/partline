const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const tsxCli = require.resolve('tsx/cli');
const preload = resolve(__dirname, 'tsx-windows-preload.cjs');
const inheritedOptions = process.env.NODE_OPTIONS?.trim();
const preloadOption = `--require=${JSON.stringify(preload)}`;
const child = spawnSync(process.execPath, [tsxCli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: false,
  env: { ...process.env, NODE_OPTIONS: inheritedOptions ? `${inheritedOptions} ${preloadOption}` : preloadOption },
});

if (child.error) throw child.error;
process.exitCode = child.status ?? 1;
