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
 * Isso impede que a sincronização sobrescreva ou quebre o ambiente do AI Studio.
 */
const IGNORE_LIST = [
  'node_modules',
  '.env',
  '.git',
  '.astrum-progress',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml'
];

function isIgnored(filePath) {
  return IGNORE_LIST.some(ignore => filePath.includes(ignore) || filePath.startsWith(ignore));
}

// Helper para chamadas de API JSON via HTTPS nativo
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

// Download nativo de arquivo bruto do GitHub e salvamento local
function downloadRawFile(url, destPath) {
  return new Promise((resolve, reject) => {
    // Garante que a pasta pai existe
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const file = fs.createWriteStream(destPath);

    const request = https.get(url, { headers: { 'User-Agent': 'Astrum-AI-Studio-Sync' } }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Tratar redirecionamento se houver
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
    console.log('1️⃣ Conectando à API do GitHub para mapear versão mais recente...');
    const commitData = await fetchJson(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`);
    const treeSha = commitData.commit.tree.sha;
    console.log(`   🔸 SHA mais recente: ${commitData.sha.substring(0, 7)}`);

    console.log('2️⃣ Mapeando toda a árvore do projeto...');
    const treeData = await fetchJson(`https://api.github.com/repos/${REPO}/git/trees/${treeSha}?recursive=1`);

    // Filtra e pega arquivos que não estão sendo ignorados
    const filesToSync = treeData.tree.filter(item => item.type === 'blob' && !isIgnored(item.path));
    console.log(`   🔸 ${filesToSync.length} arquivos identificados como válidos para sync.\n`);

    console.log('3️⃣ Baixando os arquivos modificados/originais do GitHub para o WorkSpace local...');
    let count = 0;
    const errors = [];

    for (const file of filesToSync) {
      const rawUrl = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${file.path}`;
      const destPath = path.resolve(process.cwd(), file.path);
      
      try {
        await downloadRawFile(rawUrl, destPath);
        count++;
        // Log de progresso a cada 20 arquivos
        if (count % 20 === 0) {
          console.log(`   ⏳ Descarregando sistema: ${count}/${filesToSync.length} arquivos processados...`);
        }
      } catch (err) {
        errors.push({ path: file.path, error: err.message });
      }
    }

    console.log(`\n✅ Sincronização concluída com sucesso!`);
    console.log(`   📥 Arquivos baixados e atualizados no container: ${count}`);
    
    if (errors.length > 0) {
      console.warn(`\n⚠️ Alguns arquivos falharam durante o download:`);
      errors.slice(0, 5).forEach(e => console.error(` - ${e.path} (${e.error})`));
      if (errors.length > 5) console.log(`   e mais ${errors.length - 5} falhas omitidas.`);
    }

  } catch (error) {
    console.error(`\n❌ Falha estrutural ao sincronizar:`, error.message);
  }
}

runSync();
