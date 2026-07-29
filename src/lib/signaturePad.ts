import jsPDF from "jspdf";
import { uploadTenantFile } from "./storage";

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

export async function processSignatureAndPdf({
  tenantId,
  osId,
  selectedOs,
  signatureData,
  dossie,
}: {
  tenantId: string;
  osId: string;
  selectedOs: any;
  signatureData: string;
  dossie?: any;
}) {
  if (!signatureData) {
    throw new Error("Canvas vazio: PDF não gerado");
  }

  const signature_url = await uploadTenantFile(
    tenantId, "signatures", `${osId}.png`, await dataUrlToBlob(signatureData),
  );

  const doc = new jsPDF();
  let y = 20;

  doc.setFontSize(16);
  doc.text(`Comprovante de OS: ${osId.slice(0, 8)}…`, 20, y); y += 12;

  doc.setFontSize(11);
  doc.text(`Cliente: ${selectedOs.client ?? dossie?.order?.customer_name ?? '—'}`, 20, y); y += 8;
  doc.text(`Endereço: ${selectedOs.address ?? dossie?.order?.address ?? '—'}`, 20, y); y += 8;
  doc.text(`Tipo: ${selectedOs.type ?? dossie?.order?.type ?? '—'}`, 20, y); y += 8;
  doc.text(`Data de conclusão: ${new Date().toLocaleString('pt-BR')}`, 20, y); y += 12;

  // Timeline do dossiê (se disponível)
  if (dossie?.timeline?.length) {
    doc.setFontSize(12);
    doc.text('Timeline:', 20, y); y += 7;
    doc.setFontSize(10);
    for (const ev of dossie.timeline.slice(0, 8)) {
      const ts = new Date(ev.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      doc.text(`  ${ts}  ${ev.event}`, 20, y); y += 6;
      if (y > 250) { doc.addPage(); y = 20; }
    }
    y += 4;
  }

  // Checklist (se disponível)
  if (dossie?.checklist?.length) {
    doc.setFontSize(12);
    doc.text('Checklist:', 20, y); y += 7;
    doc.setFontSize(10);
    for (const item of dossie.checklist) {
      doc.text(`  [${item.done ? 'X' : ' '}] ${item.label}`, 20, y); y += 6;
      if (y > 250) { doc.addPage(); y = 20; }
    }
    y += 4;
  }

  // Materiais (se disponível)
  if (dossie?.materials?.length) {
    doc.setFontSize(12);
    doc.text('Materiais utilizados:', 20, y); y += 7;
    doc.setFontSize(10);
    for (const m of dossie.materials) {
      doc.text(`  • ${m.name}${m.serial_number ? ' — ' + m.serial_number : ''}`, 20, y); y += 6;
      if (y > 250) { doc.addPage(); y = 20; }
    }
    y += 4;
  }

  // Resumo IA (se disponível)
  if (dossie?.order?.ai_summary) {
    doc.setFontSize(12);
    doc.text('Resumo:', 20, y); y += 7;
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(dossie.order.ai_summary, 170);
    doc.text(lines, 20, y); y += lines.length * 6 + 4;
  }

  if (y > 220) { doc.addPage(); y = 20; }
  doc.setFontSize(12);
  doc.text('Assinatura do Cliente:', 20, y); y += 8;
  doc.addImage(signatureData, 'PNG', 20, y, 80, 40);

  const pdfDataUri = doc.output("datauristring");
  const contract_url = await uploadTenantFile(
    tenantId, "contracts", `${osId}.pdf`, await dataUrlToBlob(pdfDataUri.toString()),
  );

  return { signature_url, contract_url };
}
