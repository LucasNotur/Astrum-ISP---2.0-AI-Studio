import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { infraLogger } from '../../infrastructure/logging/logger';
import crypto from 'crypto';

/**
 * Cloudflare R2 Adapter
 *
 * BLOCO 5 — Object Storage (zero egress fees)
 * R2 usa API compatível com S3 — mesma interface, custo de saída = $0
 *
 * USOS:
 * - Documentos RAG (PDFs, manuais técnicos)
 * - Áudios de WhatsApp
 * - Relatórios gerados (Excel, PDF)
 * - Backups de conversas
 */

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  },
});

const BUCKET = process.env.R2_BUCKET_NAME ?? 'astrum-storage';

export interface UploadResult {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

export class R2Adapter {

  /**
   * Upload de arquivo com organização por tenant.
   * Path: {tenantId}/{category}/{timestamp}-{filename}
   */
  async upload(
    tenantId: string,
    category: 'documents' | 'audios' | 'reports' | 'backups',
    filename: string,
    body: Buffer | Uint8Array | string,
    contentType: string,
  ): Promise<UploadResult> {
    const timestamp = Date.now();
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${tenantId}/${category}/${timestamp}-${sanitized}`;

    await r2Client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: {
        tenantId,
        category,
        originalFilename: filename,
        uploadedAt: new Date().toISOString(),
      },
    }));

    const size = typeof body === 'string'
      ? Buffer.byteLength(body)
      : body.byteLength;

    infraLogger.info({ tenantId, key, size, category }, 'R2: file uploaded');

    return {
      key,
      url: `${process.env.R2_PUBLIC_URL}/${key}`,
      size,
      contentType,
    };
  }

  /**
   * URL pré-assinada para download direto (sem proxy pelo servidor).
   * Expira em 1 hora por padrão.
   */
  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    return getSignedUrl(r2Client, command, { expiresIn });
  }

  /**
   * Stream do conteúdo do arquivo (para re-indexação RAG).
   */
  async getContent(key: string): Promise<Buffer> {
    const response = await r2Client.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }));

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Deletar arquivo (LGPD: direito ao esquecimento).
   */
  async delete(key: string): Promise<void> {
    await r2Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    infraLogger.info({ key }, 'R2: file deleted');
  }

  /**
   * Gerar key único para arquivo.
   */
  generateKey(tenantId: string, category: string, filename: string): string {
    const hash = crypto.createHash('sha256')
      .update(`${tenantId}${filename}${Date.now()}`)
      .digest('hex')
      .slice(0, 8);
    return `${tenantId}/${category}/${hash}-${filename}`;
  }
}

export const r2Adapter = new R2Adapter();
