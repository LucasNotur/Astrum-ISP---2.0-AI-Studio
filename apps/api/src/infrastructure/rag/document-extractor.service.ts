import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

/**
 * Extrai texto puro de um documento pelo file_type já validado no upload
 * (`ALLOWED_TYPES` em documents.routes.ts: pdf, docx, txt, md).
 */
export async function extractText(buffer: Buffer, fileType: string): Promise<string> {
  switch (fileType) {
    case 'pdf': {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        return result.text ?? '';
      } finally {
        await parser.destroy();
      }
    }
    case 'docx': {
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? '';
    }
    case 'txt':
    case 'md':
      return buffer.toString('utf-8');
    default:
      throw new Error(`Tipo de arquivo não suportado para extração: ${fileType}`);
  }
}
