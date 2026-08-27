/**
 * QA — Smoke test do pipeline de ingestão RAG com um PDF realista de 200 páginas.
 *
 * Item do CHECKLIST_MASTER.md ("IA & RAG"): "Pipeline de ingestão PDF testado
 * (200 páginas sem erros)".
 *
 * ESCOPO: exercita as etapas do pipeline que processam o CONTEÚDO do documento —
 * extração de texto (pdf-parse), chunking (document-chunker.service),
 * embeddings (OpenAI real) e upsert vetorial (Qdrant real) — as etapas onde um
 * documento de 200 páginas pode realmente falhar (timeout do parser, chunking
 * degenerado, rate limit de embeddings, payload grande demais pro Qdrant).
 *
 * FORA DE ESCOPO: upload via R2 (`R2_ACCESS_KEY_ID`/`CLOUDFLARE_ACCOUNT_ID` não
 * configurados neste ambiente local — é credencial externa, ver
 * CHECKLIST_PENDENCIAS_EXTERNAS.md) e a rota HTTP `POST /api/v2/documents/upload`
 * em si. Essa camada é um passthrough fino já coberto por
 * `documents.worker.test.ts` (mock) — não é onde um documento grande quebra.
 *
 * Usa um tenantId de teste isolado (`qa-pdf-ingestion-*`) — nunca toca em
 * `knowledge_documents`/tenants reais no Supabase. Cria uma coleção Qdrant
 * temporária e a APAGA no fim (sucesso ou falha), via `finally`.
 *
 * Rodar: npx tsx -r dotenv/config scripts/qa/pdf-ingestion-smoke.ts
 */

import { extractText } from '../../apps/api/src/infrastructure/rag/document-extractor.service';
import { chunkTechnicalManual } from '../../apps/api/src/infrastructure/rag/document-chunker.service';
import { generateEmbeddingsBatchWithFailover } from '../../apps/api/src/adapters/ai/embedding.service';
import { ensureCollection, upsertPoints, getQdrantClient, getTenantCollection } from '../../apps/api/src/adapters/vector/qdrant.adapter';
import crypto from 'node:crypto';

const PAGE_COUNT = 200;

// --- Gerador de PDF mínimo válido (sem dependência nova) -------------------
// Constrói um PDF de N páginas à mão (catálogo + árvore de páginas + stream de
// conteúdo por página + fonte Helvetica padrão, sem embutir fonte) com texto
// realista de manual técnico de ISP, longo o bastante pra produzir centenas de
// chunks — o mesmo formato de documento real que um tenant sobe em produção.

function escapePdfText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

const FILLER_SENTENCES = [
  'Antes de iniciar a instalacao, verifique se a ONU esta energizada e o LED de sinal optico esta aceso em verde continuo.',
  'O roteador deve ser posicionado em local ventilado, longe de fontes de calor e interferencia eletromagnetica.',
  'Para configurar o Wi-Fi, acesse o painel administrativo em 192.168.0.1 com as credenciais padrao de fabrica.',
  'Em caso de queda de sinal, verifique primeiro o nivel de potencia optica recebida (deve estar entre -8 e -25 dBm).',
  'O tecnico deve registrar no aplicativo de campo o numero de serie do equipamento instalado e a foto do splitter.',
  'Clientes com plano acima de 300 Mbps devem receber roteador com suporte a Wi-Fi 6 para atingir a velocidade contratada.',
  'A fusao de fibra optica deve apresentar perda de insercao inferior a 0.3 dB, conforme medido no OTDR.',
  'Reinicie o equipamento ONU/roteador por 30 segundos antes de abrir chamado tecnico para problemas de conectividade.',
  'O certificado de instalacao deve ser assinado digitalmente pelo cliente ao final do atendimento em campo.',
  'Mantenha sempre um estoque minimo de conectores SC/APC e cordoes opticos no veiculo do tecnico de campo.',
];

function buildPageLines(pageNumber: number): string[] {
  const lines: string[] = [];
  lines.push(`Manual Tecnico de Instalacao ISP - Capitulo ${Math.ceil(pageNumber / 10)}`);
  lines.push(`Pagina ${pageNumber} de ${PAGE_COUNT}`);
  lines.push('');
  for (let i = 0; i < 18; i++) {
    const sentence = FILLER_SENTENCES[(pageNumber * 3 + i) % FILLER_SENTENCES.length];
    lines.push(`${i + 1}. ${sentence}`);
  }
  return lines;
}

function generateSyntheticPdf(pageCount: number): Buffer {
  const objects: string[] = [];
  const FONT_OBJ = 3 + pageCount * 2; // após N páginas + N streams

  // obj 1: Catalog
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;

  // obj 2: Pages tree
  const kids = Array.from({ length: pageCount }, (_, i) => `${3 + i} 0 R`).join(' ');
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`;

  // objs 3..3+N-1: Page dicts; objs 3+N..3+2N-1: content streams
  for (let i = 0; i < pageCount; i++) {
    const pageObjNum = 3 + i;
    const contentObjNum = 3 + pageCount + i;
    objects[pageObjNum] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 ${FONT_OBJ} 0 R >> >> /Contents ${contentObjNum} 0 R >>`;

    const lines = buildPageLines(i + 1);
    let stream = `BT\n/F1 11 Tf\n50 750 Td\n14 TL\n`;
    lines.forEach((line, idx) => {
      stream += `(${escapePdfText(line)}) Tj\n`;
      if (idx < lines.length - 1) stream += `T*\n`;
    });
    stream += `ET`;
    const streamBytes = Buffer.byteLength(stream, 'latin1');
    objects[contentObjNum] = `<< /Length ${streamBytes} >>\nstream\n${stream}\nendstream`;
  }

  // Font object
  objects[FONT_OBJ] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;

  // --- Serializar com offsets exatos para o xref ---
  const chunks: Buffer[] = [];
  let offset = 0;
  const push = (s: string) => {
    const buf = Buffer.from(s, 'latin1');
    chunks.push(buf);
    offset += buf.length;
  };

  push('%PDF-1.4\n');
  const objOffsets: number[] = [];
  for (let n = 1; n <= FONT_OBJ; n++) {
    objOffsets[n] = offset;
    push(`${n} 0 obj\n${objects[n]}\nendobj\n`);
  }

  const xrefOffset = offset;
  const totalObjs = FONT_OBJ + 1; // inclui obj 0 (livre)
  push(`xref\n0 ${totalObjs}\n`);
  push('0000000000 65535 f \n');
  for (let n = 1; n <= FONT_OBJ; n++) {
    push(`${String(objOffsets[n]).padStart(10, '0')} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${totalObjs} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return Buffer.concat(chunks);
}

// --- Smoke test --------------------------------------------------------------

function fmtMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

async function main() {
  const testTenantId = `qa-pdf-ingestion-${Date.now()}`;
  let collectionName = getTenantCollection(testTenantId); // atualizado depois de saber o provider real
  const errors: string[] = [];
  let createdCollection = false;

  console.log(`\n=== PDF Ingestion Smoke Test — ${PAGE_COUNT} páginas — tenant ${testTenantId} ===\n`);

  try {
    // 1. Gerar PDF sintético
    let t0 = Date.now();
    const pdfBuffer = generateSyntheticPdf(PAGE_COUNT);
    console.log(`[1/5] PDF gerado: ${(pdfBuffer.length / 1024).toFixed(0)} KB em ${fmtMs(Date.now() - t0)}`);

    // 2. Extração de texto (pdf-parse real)
    t0 = Date.now();
    const text = await extractText(pdfBuffer, 'pdf');
    console.log(`[2/5] Texto extraído: ${text.length} chars em ${fmtMs(Date.now() - t0)}`);
    if (!text || text.trim().length === 0) {
      throw new Error('Extração retornou texto vazio para um PDF de 200 páginas com conteúdo real.');
    }
    // Sanidade: primeira e última página devem aparecer no texto extraído
    if (!text.includes('Pagina 1 de 200')) errors.push('Texto extraído não contém marcador da página 1.');
    if (!text.includes(`Pagina ${PAGE_COUNT} de ${PAGE_COUNT}`)) errors.push(`Texto extraído não contém marcador da última página (${PAGE_COUNT}).`);

    // 3. Chunking
    t0 = Date.now();
    const chunks = chunkTechnicalManual(text);
    console.log(`[3/5] Chunking: ${chunks.length} chunks em ${fmtMs(Date.now() - t0)}`);
    if (chunks.length === 0) throw new Error('Chunking produziu 0 chunks para um documento de 200 páginas.');
    const avgChunkSize = chunks.reduce((s, c) => s + c.text.length, 0) / chunks.length;
    console.log(`      tamanho médio do chunk: ${avgChunkSize.toFixed(0)} chars`);

    // 4. Embeddings reais (OpenAI, com failover pro Gemini se faltar crédito)
    t0 = Date.now();
    const chunkTexts = chunks.map(c => c.text);
    const { provider, embeddings } = await generateEmbeddingsBatchWithFailover(chunkTexts, testTenantId);
    console.log(`[4/5] Embeddings gerados via ${provider}: ${embeddings.length}/${chunks.length} em ${fmtMs(Date.now() - t0)}`);
    if (embeddings.length !== chunks.length) {
      errors.push(`Contagem de embeddings (${embeddings.length}) != contagem de chunks (${chunks.length}).`);
    }
    const expectedDims = embeddings[0]?.length ?? 0;
    const badVector = embeddings.findIndex(v => !Array.isArray(v) || v.length !== expectedDims);
    if (badVector !== -1) errors.push(`Embedding no índice ${badVector} não tem ${expectedDims} dimensões (inconsistente com o restante do batch).`);

    // 5. Upsert real no Qdrant (coleção do provider que respondeu)
    t0 = Date.now();
    collectionName = getTenantCollection(testTenantId, provider);
    await ensureCollection(testTenantId, provider, expectedDims);
    createdCollection = true;
    const points = chunks.map((chunk, i) => ({
      id: crypto.randomUUID(),
      vector: embeddings[i] ?? [],
      payload: {
        document_id: 'qa-smoke-test-doc',
        article_id: null,
        entity_type: 'document' as const,
        tenant_id: testTenantId,
        filename: 'manual-tecnico-200-paginas.pdf',
        chunk_index: chunk.chunkIndex,
        chunk_text: chunk.text,
        file_type: 'pdf',
        created_at: new Date().toISOString(),
        embedding_provider: provider,
      },
    }));
    await upsertPoints(testTenantId, points, provider);
    console.log(`[5/5] Upsert no Qdrant (${collectionName}): ${points.length} pontos em ${fmtMs(Date.now() - t0)}`);

    // Verificação: contagem real na coleção bate com o esperado
    const qdrant = getQdrantClient();
    const info = await qdrant.getCollection(collectionName);
    const pointsCount = (info as any).points_count ?? 0;
    console.log(`      pontos confirmados na coleção: ${pointsCount}`);
    if (pointsCount !== points.length) {
      errors.push(`Coleção Qdrant tem ${pointsCount} pontos, esperado ${points.length}.`);
    }

    console.log(`\n=== RESULTADO ===`);
    console.log(`Páginas: ${PAGE_COUNT} | Chars extraídos: ${text.length} | Chunks: ${chunks.length} | Embeddings: ${embeddings.length} | Pontos Qdrant: ${pointsCount}`);

    if (errors.length > 0) {
      console.log(`\n❌ FALHOU — ${errors.length} problema(s):`);
      errors.forEach(e => console.log(`  - ${e}`));
      process.exitCode = 1;
    } else {
      console.log(`\n✅ PASSOU — pipeline de ingestão processou 200 páginas sem erros.`);
    }
  } catch (err) {
    console.error(`\n❌ FALHOU — exceção não tratada:`, err);
    process.exitCode = 1;
  } finally {
    if (createdCollection) {
      try {
        await getQdrantClient().deleteCollection(collectionName);
        console.log(`\n[cleanup] Coleção Qdrant '${collectionName}' removida.`);
      } catch (cleanupErr) {
        console.error(`[cleanup] FALHA ao remover coleção '${collectionName}' — remover manualmente:`, cleanupErr);
      }
    }
  }
}

main();
