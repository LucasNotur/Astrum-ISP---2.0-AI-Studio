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

export const siteScrapeWorker = isMockRedis ? null : new Worker("site-scrape", async (job) => {
  if (job.name === "scrape_tenant_sites") {
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
            console.error(`[Site Scrape] Failed to fetch ${url} for tenant ${tenantId}. Status: ${response.status}`);
            continue;
          }
          
          const html = await response.text();
          const $ = cheerio.load(html);
          
          // Remove scripts, styles for better comparison
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
            
            // 4. Re-indexa via /api/rag/scrape-url
            await fetch(`http://127.0.0.1:3000/api/rag/scrape-url`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ tenantId, url })
            }).catch(e => console.error(`[Site Scrape] Error re-indexing ${url}:`, e));
            
            // 5. Notifica admin por email
            const adminEmail = tenantData.email || 'admin@' + (tenantData.domain || 'localhost'); // fallback email if not configured specifically
            
            // Get email settings from settings if they exist
            let mailOptions = {
              from: 'astrum_system@localhost',
              to: adminEmail,
              subject: 'Alerta Astrum: Website Atualizado',
              text: `Detectamos uma alteração no conteúdo do site (${url}). O banco de conhecimento vetorial (RAG) está sendo reindexado automaticamente.`
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
                 console.log(`[Site Scrape] Sent mock email notification to ${adminEmail} for tenant ${tenantId}`);
                 // Optionally record in firestore
                 await db.collection("notifications").add({
                    tenantId,
                    title: "Website Reindexado",
                    body: `Detectamos uma alteração no seu site (${url}) e o reindexamos.`,
                    type: "system",
                    created_at: new Date(),
                    read: false
                 });
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
}, {
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
