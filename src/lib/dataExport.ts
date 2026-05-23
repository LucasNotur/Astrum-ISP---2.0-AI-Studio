import { adminDb as db } from "./firebaseAdmin.ts";
import { getStorage } from "firebase-admin/storage";
import archiver from "archiver";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import redisClient from "./redis.ts";
import { sendEmail } from "./email.ts";
import { logger } from "./logger.ts";

export async function processDataExport(tenantId: string, requestedBy: string) {
  const redisKey = `export_status:${tenantId}`;
  
  const updateProgress = async (status: string, progress: number, link?: string) => {
    if (redisClient) {
      await redisClient.set(redisKey, JSON.stringify({ status, progress, link, updatedAt: new Date().toISOString() }));
    }
  };

  try {
    await updateProgress("started", 10);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `export_${tenantId}_${Date.now()}_`));
    
    // Fetch customers
    await updateProgress("fetching_customers", 20);
    const customersSnap = await db.collection("customers").where("tenantId", "==", tenantId).get();
    const customers = customersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    fs.writeFileSync(path.join(tempDir, "customers.json"), JSON.stringify(customers, null, 2));

    // Fetch tickets
    await updateProgress("fetching_tickets", 40);
    const ticketsSnap = await db.collection("tickets").where("tenantId", "==", tenantId).get();
    const tickets = ticketsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    fs.writeFileSync(path.join(tempDir, "tickets.json"), JSON.stringify(tickets, null, 2));

    // Fetch messages (can be heavy, handle batching if we were in prod, for now fetch directly or at least for each ticket)
    await updateProgress("fetching_messages", 60);
    const messages: any[] = [];
    // Or we could run a collection group query if messages have tenantId, wait, messages might not have tenantId reliably
    // Let's check how messages are structured. We might just query subcollections for all these tickets.
    for (const t of ticketsSnap.docs) {
      const msgsSnap = await t.ref.collection("messages").get();
      msgsSnap.docs.forEach(m => messages.push({ ticketId: t.id, id: m.id, ...m.data() }));
    }
    fs.writeFileSync(path.join(tempDir, "messages.json"), JSON.stringify(messages, null, 2));

    await updateProgress("compressing", 80);
    const zipPath = path.join(tempDir, `export_${tenantId}.zip`);
    
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));
      archive.pipe(output);
      archive.file(path.join(tempDir, "customers.json"), { name: 'customers.json' });
      archive.file(path.join(tempDir, "tickets.json"), { name: 'tickets.json' });
      archive.file(path.join(tempDir, "messages.json"), { name: 'messages.json' });
      archive.finalize();
    });

    await updateProgress("uploading", 90);
    const bucket = getStorage().bucket();
    const uniqueFileName = `exports/${tenantId}/data_export_${Date.now()}.zip`;
    const destination = bucket.file(uniqueFileName);
    
    await destination.save(fs.readFileSync(zipPath), {
      metadata: { contentType: 'application/zip' }
    });

    const [url] = await destination.getSignedUrl({
      action: 'read',
      expires: Date.now() + 72 * 60 * 60 * 1000 // 72 hours
    });

    await updateProgress("completed", 100, url);

    await sendEmail(
      requestedBy,
      "Exportação de Dados Concluída",
      `<p>Sua exportação de dados foi concluída com sucesso!</p>
       <p><a href="${url}" target="_blank">Clique aqui para baixar o arquivo ZIP</a></p>
       <p>Este link ficará válido por 72 horas.</p>`
    );

    // Cleanup temp dir
    fs.rmSync(tempDir, { recursive: true, force: true });

  } catch (error: any) {
    logger.error("export_failed", { error: error.message, tenantId });
    await updateProgress("error", 0);
  }
}
