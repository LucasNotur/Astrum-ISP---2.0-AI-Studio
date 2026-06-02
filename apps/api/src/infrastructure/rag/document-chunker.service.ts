/**
 * Document Chunker — divide documentos em chunks para indexação RAG.
 *
 * ESTRATÉGIA: Chunking por overlap sliding window
 * - Chunk size: 500 tokens (~2000 chars)
 * - Overlap: 50 tokens (~200 chars) — garante que contexto não seja perdido
 *   nas bordas dos chunks
 *
 * SUPORTE: texto puro (PDF já convertido, TXT, MD)
 * Conversão PDF → texto: será feita no worker de indexação
 */

export interface DocumentChunk {
  chunkIndex: number;
  text: string;
  startChar: number;
  endChar: number;
  tokenEstimate: number;
}

interface ChunkingOptions {
  chunkSize?: number;    // chars por chunk (default: 2000)
  overlap?: number;      // chars de overlap (default: 200)
  minChunkSize?: number; // tamanho mínimo para não criar chunk inútil (default: 100)
}

/**
 * Estimativa rápida de tokens (sem chamar a API).
 * Regra geral: 1 token ≈ 4 chars em inglês, ≈ 3 chars em português.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Encontra um ponto de quebra natural (fim de parágrafo, frase) próximo ao índice.
 */
function findBreakPoint(text: string, targetIndex: number, searchWindow = 100): number {
  const start = Math.max(0, targetIndex - searchWindow);
  const end = Math.min(text.length, targetIndex + searchWindow);
  const slice = text.slice(start, end);

  // Tentar quebrar em parágrafo primeiro
  const paragraphBreak = slice.lastIndexOf('\n\n', targetIndex - start);
  if (paragraphBreak !== -1) return start + paragraphBreak;

  // Tentar quebrar em nova linha
  const lineBreak = slice.lastIndexOf('\n', targetIndex - start);
  if (lineBreak !== -1) return start + lineBreak;

  // Tentar quebrar em fim de frase
  const sentenceBreak = slice.lastIndexOf('. ', targetIndex - start);
  if (sentenceBreak !== -1) return start + sentenceBreak + 2;

  // Fallback: quebrar no espaço mais próximo
  const spaceBreak = slice.lastIndexOf(' ', targetIndex - start);
  if (spaceBreak !== -1) return start + spaceBreak;

  return targetIndex;
}

export function chunkDocument(
  text: string,
  options: ChunkingOptions = {}
): DocumentChunk[] {
  const {
    chunkSize = 2000,
    overlap = 200,
    minChunkSize = 100,
  } = options;

  const cleanText = text.replace(/\r\n/g, '\n').trim();
  if (cleanText.length === 0) return [];

  const chunks: DocumentChunk[] = [];
  let startChar = 0;
  let chunkIndex = 0;

  while (startChar < cleanText.length) {
    const rawEnd = Math.min(startChar + chunkSize, cleanText.length);
    const endChar = rawEnd < cleanText.length
      ? findBreakPoint(cleanText, rawEnd)
      : rawEnd;

    const chunkText = cleanText.slice(startChar, endChar).trim();

    if (chunkText.length >= minChunkSize) {
      chunks.push({
        chunkIndex,
        text: chunkText,
        startChar,
        endChar,
        tokenEstimate: estimateTokens(chunkText),
      });
      chunkIndex++;
    }

    if (endChar >= cleanText.length) {
      break;
    }

    // Avançar com overlap
    startChar = Math.max(startChar + 1, endChar - overlap);
  }

  return chunks;
}

/**
 * Chunking especializado para manuais técnicos de ISP.
 * Preserva seções (headings) como pontos de quebra prioritários.
 */
export function chunkTechnicalManual(text: string): DocumentChunk[] {
  // Dividir por seções (headings markdown ou numeradas)
  const sectionPattern = /(?=^#{1,3}\s|^\d+\.\s)/m;
  const sections = text.split(sectionPattern).filter(s => s.trim().length > 0);

  const allChunks: DocumentChunk[] = [];
  let globalOffset = 0;
  let chunkIndex = 0;

  for (const section of sections) {
    if (section.length <= 2000) {
      // Seção pequena: chunk único
      allChunks.push({
        chunkIndex: chunkIndex++,
        text: section.trim(),
        startChar: globalOffset,
        endChar: globalOffset + section.length,
        tokenEstimate: estimateTokens(section),
      });
    } else {
      // Seção grande: sub-chunking
      const subChunks = chunkDocument(section, { chunkSize: 1500, overlap: 150 });
      for (const sub of subChunks) {
        allChunks.push({
          ...sub,
          chunkIndex: chunkIndex++,
          startChar: globalOffset + sub.startChar,
          endChar: globalOffset + sub.endChar,
        });
      }
    }

    globalOffset += section.length;
  }

  return allChunks;
}
