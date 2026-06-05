import fs from 'fs';
import path from 'path';
import https from 'https';

// ==========================================
// CONFIGURAÇÕES DO REPOSITÓRIO
// ==========================================
const REPO = 'LucasNotur/Astrum-ISP---2.0-AI-Studio';
const BRANCH = 'main';

/**
 * Lista de arquivos e pastas para IGNORAR durante o Sync.
 */
const IGNORE_LIST = [
  'node_modules',
  '.git',
  '.astrum-progress',
  'yarn.lock',
  'pnpm-lock.yaml'
];

function isIgnored(filePath) {
  return IGNORE_LIST.some(ignore => filePath.includes(ignore) || filePath.startsWith(ignore));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Astrum-AI-Studio-Sync', 'Accept': 'application/vnd.github.v3+json' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Falha HTTP ${res.statusCode} ao acessar ${url}`));
        }
      });
    });
    req.on('error', reject);
  });
}

function downloadRawFile(url, destPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const file = fs.createWriteStream(destPath);

    const request = https.get(url, { headers: { 'User-Agent': 'Astrum-AI-Studio-Sync' } }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        return downloadRawFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} - ${url}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve());
      });
    });
    
    request.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function runSync() {
  console.log(`\n🔄 [ASTRUM SYNC] Iniciando Sincronização Unidirecional (GitHub -> AI Studio)...`);
  console.log(`📦 Repositório: ${REPO} | Branch: ${BRANCH}\n`);

  try {
    const commitData = await fetchJson(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`);
    const treeSha = commitData.commit.tree.sha;
    
    const treeData = await fetchJson(`https://api.github.com/repos/${REPO}/git/trees/${treeSha}?recursive=1`);
    
    const filesToSync = treeData.tree.filter(item => item.type === 'blob' && !isIgnored(item.path));
    
    let count = 0;
    const errors = [];

    for (const file of filesToSync) {
      const rawUrl = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${file.path}`;
      const destPath = path.resolve(process.cwd(), file.path);
      try {
        await downloadRawFile(rawUrl, destPath);
        count++;
      } catch (err) {
        errors.push({ path: file.path, error: err.message });
      }
    }
  } catch (error) {
    console.error(`\n❌ Falha estrutural ao sincronizar:`, error.message);
  }
}

runSync();
