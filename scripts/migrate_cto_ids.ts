import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { db } from '../src/lib/firebase';
import { encryptCpf } from '../src/lib/db';
import { collection, query, where, getDocs, writeBatch } from 'firebase/firestore';

async function run() {
  const filePath = resolve(process.cwd(), 'scripts/data/cto_map.csv');
  if (!existsSync(filePath)) {
    console.error(`Arquivo não encontrado: ${filePath}`);
    process.exit(1);
  }

  const fileContent = readFileSync(filePath, 'utf-8');
  const lines = fileContent.split('\n').filter(l => l.trim() !== '');
  
  if (lines.length === 0) {
    console.log('Arquivo CSV vazio.');
    return;
  }

  // Remove header if present
  if (lines[0].toLowerCase().includes('cpf') && lines[0].toLowerCase().includes('cto_id')) {
    lines.shift();
  }

  const records = lines.map(line => {
    const [cpfRaw, ctoIdRaw] = line.split(',');
    return { 
      cpf: cpfRaw?.trim(), 
      cto_id: ctoIdRaw?.trim() 
    };
  }).filter(r => r.cpf && r.cto_id);

  console.log(`Iniciando migração de ${records.length} registros...`);

  let atualizados = 0;
  const total = records.length;

  let batch = writeBatch(db);
  let batchCount = 0;

  for (let i = 0; i < records.length; i++) {
    const { cpf, cto_id } = records[i];
    const encryptedCpf = encryptCpf(cpf);
    
    // Mask logic to match requested format "XXX***XX"
    const cleanCpf = cpf.replace(/\D/g, "");
    const maskedCpf = cleanCpf.length >= 5 
      ? cleanCpf.slice(0, 3) + "***" + cleanCpf.slice(-2) 
      : "***";

    try {
      const q = query(collection(db, 'customers'), where('cpf', '==', encryptedCpf));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        console.warn(`CPF não encontrado: ${maskedCpf}`);
        continue;
      }

      for (const cusDoc of querySnapshot.docs) {
        batch.update(cusDoc.ref, { cto_id });
        batchCount++;
        atualizados++;

        if (batchCount === 500) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
          console.log(`Atualizado ${atualizados} de ${total} clientes`);
        }
      }
    } catch (e: any) {
      console.error(`Erro ao processar CPF ${maskedCpf}: ${e.message}`);
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log(`Atualizado ${atualizados} de ${total} clientes`);
  }

  console.log(`Migração concluída! Total atualizados: ${atualizados}/${total}`);
  process.exit(0);
}

run();
