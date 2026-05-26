import { Queue, Worker } from "bullmq";
import redis from "../lib/redis";
import { adminDb as db } from "../lib/firebaseAdmin";
import * as cheerio from "cheerio";
import crypto from "crypto";
import nodemailer from "nodemailer";

const isMockRedis = !((redis as any).options);

export const siteScrapeQueue = isMockRedis ? null : new Queue("site-scrape", {
  connection: redis as any
});

export const processSiteScrapeJob = async (job: any) => {
  if (job.name === "scrape_tenant_sites" || job.name === "scrape_test") {
    try {
      const tenantsSnap = await db.collection("tenants").where("active", "==", true).get();
      
      for (const tenantDoc of tenantsSnap.docs) {
        const tenantId = tenantDoc.id;
        const tenantData = tenantDoc.data();
        
        if (!tenantData.website_url) continue;
        
        const url = tenantData.website_url;
        
        try {
          // 1. Fetch via cheerio
          const response = await fetch(url);
          if (!response.ok) {
            console.warn(`[Site Scrape] Failed to fetch ${url} for tenant ${tenantId}. Status: ${response.status}`);
            continue;
          }
          
          const html = await response.text();
          const $ = cheerio.load(html);
          
          // 4. Remove scripts, styles for better comparison
          $('script, style').remove();
          const content = $('body').text().replace(/\s+/g, ' ').trim();
          
          // 2. Compara MD5 com versão anterior em Redis
          const hash = crypto.createHash('md5').update(content).digest('hex');
          const cacheKey = `site_hash:${tenantId}`;
          const previousHash = await redis.get(cacheKey);
          
          if (previousHash !== hash) {
            console.log(`[Site Scrape] Website content changed for ${tenantId}. Re-indexing...`);
            
            // 3. Update hash
            await redis.set(cacheKey, hash);
            
            // Generate chunks and save as articles
            const chunks = [];
            const chunkSize = 1000;
            for (let i = 0; i < content.length; i += chunkSize) {
              chunks.push(content.substring(i, i + chunkSize));
            }
            
            const batch = db.batch();
            chunks.forEach((chunkText, idx) => {
              const ref = db.collection("knowledge_base").doc(`${tenantId}_chunk_${idx}`);
              batch.set(ref, {
                tenant_id: tenantId,
                title: `Website Content Part ${idx + 1}`,
                content: chunkText,
                source: url,
                type: "website",
                updated_at: new Date()
              });
            });
            await batch.commit();

            // 5. Notifica admin por email - Contem a URL e número de chunks
            const adminEmail = tenantData.email || 'admin@' + (tenantData.domain || 'localhost'); // fallback email if not configured specifically
            
            let mailOptions = {
              from: 'astrum_system@localhost',
              to: adminEmail,
              subject: 'Alerta Astrum: Website Atualizado',
              text: `Detectamos uma alteração no conteúdo do site (${url}). O banco de conhecimento vetorial (RAG) está sendo reindexado automaticamente.\n\nNúmero de chunks indexados: ${chunks.length}`
            };
            
            try {
              let smtpConfig;
              const settingsSnap = await db.collection("tenants").doc(tenantId).collection("settings").doc("email").get();
              if (settingsSnap.exists) {
                 smtpConfig = settingsSnap.data();
              }
              
              if (smtpConfig && smtpConfig.host) {
                 const transporter = nodemailer.createTransport({
                    host: smtpConfig.host,
                    port: smtpConfig.port || 587,
                    secure: smtpConfig.secure || false,
                    auth: {
                       user: smtpConfig.user,
                       pass: smtpConfig.pass
                    }
                 });
                 await transporter.sendMail({
                    from: smtpConfig.from || mailOptions.from,
                    to: adminEmail,
                    subject: mailOptions.subject,
                    text: mailOptions.text
                 });
              } else {
                 console.log(`[Site Scrape] Sent mock email notification to ${adminEmail} for tenant ${tenantId}. Chunks: ${chunks.length}`);
              }
            } catch (emailError) {
              console.error(`[Site Scrape] Failed to send email to ${adminEmail}:`, emailError);
            }
          } else {
             console.log(`[Site Scrape] No changes for tenant ${tenantId} website (${url}).`);
          }
          
        } catch (err: any) {
           console.error(`[Site Scrape] Error processing tenant ${tenantId}:`, err.message);
        }
      }
    } catch (e: any) {
      console.error(`[Site Scrape] Job failed:`, e.message);
    }
  }
};

export const siteScrapeWorker = isMockRedis ? null : new Worker("site-scrape", processSiteScrapeJob, {
  connection: redis as any
});

if (siteScrapeQueue && siteScrapeWorker) {
  siteScrapeWorker.on("failed", (job, err) => {
    console.error(`[Site Scrape] Job ${job?.id} failed:`, err);
  });
  
  siteScrapeQueue.add("scrape_tenant_sites", {}, {
    repeat: {
      pattern: "0 2 * * 0", // Every Sunday at 2:00 AM
    },
    jobId: "weekly-scrape-tenant-sites"
  }).catch(e => console.error("Could not add repeatable site-scrape job:", e));
}
