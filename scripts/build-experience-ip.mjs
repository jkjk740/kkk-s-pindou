import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const outputDir = path.join(root, 'dist/experience-ip/mp-weixin');
const privateConfigPath = path.join(outputDir, 'project.private.config.json');

async function readPrivateConfig() {
  try {
    return JSON.parse(await readFile(privateConfigPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

// Retain local developer-tool settings even if uni clears the output directory.
const previousConfig = await readPrivateConfig();
const child = spawn(process.execPath, [
  path.join(root, 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'),
  'build', '-p', 'mp-weixin', '--mode', 'experience-ip'
], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    UNI_INPUT_DIR: path.join(root, 'src'),
    UNI_OUTPUT_DIR: outputDir,
    VITE_API_BASE_URL: 'http://121.41.36.64'
  }
});
const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', (code) => resolve(code ?? 1));
});
if (exitCode !== 0) process.exit(exitCode);

const generatedConfig = await readPrivateConfig();
const privateConfig = {
  ...previousConfig,
  ...generatedConfig,
  setting: {
    ...previousConfig.setting,
    ...generatedConfig.setting,
    urlCheck: false
  }
};
await writeFile(privateConfigPath, JSON.stringify(privateConfig, null, 2) + '\n');
console.log('服务器 IP 体验包已输出：' + outputDir);
console.log('体验者需要在微信手机端开启小程序调试模式。');
