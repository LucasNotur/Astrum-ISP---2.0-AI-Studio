import jsPDF from "jspdf";
import { storage } from "./firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";

export async function processSignatureAndPdf({
  tenantId,
  osId,
  selectedOs,
  signatureData
}: {
  tenantId: string;
  osId: string;
  selectedOs: any;
  signatureData: string;
}) {
  if (!signatureData) {
    throw new Error("Canvas vazio: PDF não gerado");
  }

  // Upload assinatura
  const sigRef = ref(storage, `tenants/${tenantId}/signatures/${osId}.png`);
  await uploadString(sigRef, signatureData, "data_url");
  const signature_url = await getDownloadURL(sigRef);

  // Gerar PDF
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Ordem de Servico: ${osId}`, 20, 20);
  doc.setFontSize(12);
  doc.text(`Cliente: ${selectedOs.client}`, 20, 30);
  doc.text(`Endereco: ${selectedOs.address}`, 20, 40);
  doc.text(`Data: ${new Date().toLocaleString()}`, 20, 50);
  doc.text("Assinatura do Cliente:", 20, 80);
  doc.addImage(signatureData, "PNG", 20, 90, 80, 40);
  
  // No node, doc.output("datauristring") is prefixed string: 'data:application/pdf;base64,...'
  const pdfDataUri = doc.output("datauristring");
  const pdfRef = ref(storage, `tenants/${tenantId}/contracts/${osId}.pdf`);
  await uploadString(pdfRef, pdfDataUri.toString(), "data_url");
  const contract_url = await getDownloadURL(pdfRef);

  return { signature_url, contract_url };
}
