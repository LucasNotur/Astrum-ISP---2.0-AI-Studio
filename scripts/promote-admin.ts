#!/usr/bin/env tsx
/**
 * scripts/promote-admin.ts
 *
 * Uso:
 *   npx tsx scripts/promote-admin.ts <uid> <tenantId> [super_admin]
 *
 * Exemplos:
 *   npx tsx scripts/promote-admin.ts QAF43mllapOP6LtgiyTRkfUdei83 uuid-do-tenant
 *   npx tsx scripts/promote-admin.ts QAF43mllapOP6LtgiyTRkfUdei83 uuid-do-tenant super_admin
 *
 * Requer: GOOGLE_APPLICATION_CREDENTIALS ou FIREBASE_SERVICE_ACCOUNT_KEY no .env
 */

import 'dotenv/config'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth }                       from 'firebase-admin/auth'
import { z }                             from 'zod'

// ── Inicializar Firebase Admin ─────────────────────────────
if (getApps().length === 0) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (serviceAccount) {
    initializeApp({ credential: cert(JSON.parse(serviceAccount)) })
  } else {
    // Usa GOOGLE_APPLICATION_CREDENTIALS automaticamente
    initializeApp()
  }
}

// ── Validar argumentos ─────────────────────────────────────
const ArgsSchema = z.tuple([
  z.string().min(20, 'UID parece curto demais'),
  z.string().uuid('tenantId deve ser UUID'),
  z.enum(['admin', 'super_admin']).optional().default('admin'),
])

const args = process.argv.slice(2)
const parsed = ArgsSchema.safeParse(args)

if (!parsed.success) {
  console.error('\n❌ Argumentos inválidos:')
  parsed.error.issues.forEach(i => console.error(`   ${i.path.join('.')}: ${i.message}`))
  console.error('\nUso: npx tsx scripts/promote-admin.ts <uid> <tenantId> [super_admin]\n')
  process.exit(1)
}

const [uid, tenantId, role] = parsed.data

// ── Verificar que o usuário existe ────────────────────────
async function main() {
  console.log(`\n🔍 Verificando UID: ${uid}...`)

  let userRecord
  try {
    userRecord = await getAuth().getUser(uid)
  } catch {
    console.error(`❌ Usuário não encontrado no Firebase: ${uid}`)
    process.exit(1)
  }

  console.log(`   Email: ${userRecord.email ?? '(sem email)'}`)
  console.log(`   Criado: ${userRecord.metadata.creationTime}`)

  // Mostrar claims atuais
  const current = userRecord.customClaims as Record<string, unknown> | undefined
  if (current) {
    console.log(`   Claims atuais: ${JSON.stringify(current)}`)
  }

  // ── Setar custom claims ──────────────────────────────────
  const newClaims = { role, tenantId }
  await getAuth().setCustomUserClaims(uid, newClaims)

  // ── Confirmar ────────────────────────────────────────────
  const updated = await getAuth().getUser(uid)
  const confirmed = updated.customClaims as Record<string, unknown> | undefined

  if (confirmed?.role === role && confirmed?.tenantId === tenantId) {
    console.log(`\n✅ Claims setadas com sucesso:`)
    console.log(`   UID:      ${uid}`)
    console.log(`   tenantId: ${tenantId}`)
    console.log(`   role:     ${role}`)
    console.log(`\n⚠️  O usuário precisa fazer logout/login para obter o novo token.\n`)
  } else {
    console.error('\n❌ Verificação falhou — claims não confirmadas após set.')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('\n❌ Erro:', err)
  process.exit(1)
})
