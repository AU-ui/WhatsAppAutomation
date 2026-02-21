/**
 * update-token.js
 * Run: node update-token.js <NEW_ACCESS_TOKEN>
 *
 * Updates the access token for ALL tenants in the database +
 * shows current token info so you can verify it worked.
 */

const Database = require('better-sqlite3')
const path = require('path')

const NEW_TOKEN = process.argv[2]
if (!NEW_TOKEN) {
  console.error('\nUsage: node update-token.js <YOUR_NEW_META_ACCESS_TOKEN>\n')
  console.error('Get token from: https://developers.facebook.com → Your App → WhatsApp → API Setup\n')
  process.exit(1)
}

const DB_PATH = path.join(__dirname, 'data', 'platform.db')
const db = new Database(DB_PATH)

// Read all tenants
const tenants = db.prepare('SELECT id, email, whatsapp FROM tenants').all()
console.log(`\nFound ${tenants.length} tenant(s)\n`)

let updated = 0
for (const t of tenants) {
  let wa = {}
  try { wa = JSON.parse(t.whatsapp || '{}') } catch {}
  if (!wa.phoneNumberId) {
    console.log(`  ⏭  ${t.email} — no phoneNumberId set, skipping`)
    continue
  }
  wa.accessToken = NEW_TOKEN
  db.prepare('UPDATE tenants SET whatsapp = ?, updatedAt = ? WHERE id = ?')
    .run(JSON.stringify(wa), new Date().toISOString(), t.id)
  console.log(`  ✅ ${t.email} → token updated (phoneNumberId: ${wa.phoneNumberId})`)
  updated++
}

console.log(`\n✅ Done — ${updated} tenant(s) updated.\n`)
console.log('Now restart your backend: npm run dev\n')

db.close()
