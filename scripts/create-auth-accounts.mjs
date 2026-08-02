#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const text = fs.readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else field += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { row.push(field); field = '' }
      else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = '' }
      else field += ch
    }
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row) }
  const header = rows.shift().map((h, i) => i === 0 ? h.replace(/^\uFEFF/, '') : h)
  return rows.filter(r => r.some(v => v !== '')).map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}

function csvEscape(v) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s
}

async function listAllUsers(admin) {
  const users = []
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < 1000) break
  }
  return users
}

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const forceRelink = args.has('--force-relink')
const root = process.cwd()
loadEnvFile(path.join(root, '.env.bulk-auth'))
loadEnvFile(path.join(root, '.env.local'))

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !secretKey) {
  console.error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const csvPath = process.env.BULK_ACCOUNTS_CSV || path.join(root, 'accounts', 'all_accounts.csv')
if (!fs.existsSync(csvPath)) {
  console.error(`CSV not found: ${csvPath}`)
  process.exit(1)
}

const records = parseCsv(fs.readFileSync(csvPath, 'utf8'))
const admin = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
})

console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${records.length} account rows from ${csvPath}`)
const existingUsers = await listAllUsers(admin)
const authByEmail = new Map(existingUsers.filter(u => u.email).map(u => [u.email.toLowerCase(), u]))
const results = []

for (const [index, r] of records.entries()) {
  const email = r.email.trim().toLowerCase()
  const role = r.role.trim()
  const entityType = r.entity_type.trim()
  const entityCode = r.entity_code.trim()
  const fullName = r.full_name.trim()
  const password = r.temporary_password
  let status = 'planned', userId = '', message = ''

  try {
    if (!['teacher','student'].includes(role) || role !== entityType) throw new Error(`Invalid role/entity_type: ${role}/${entityType}`)
    if (!email) throw new Error('Missing email')

    let user = authByEmail.get(email)
    if (!apply) {
      status = user ? 'would_link_existing' : 'would_create'
      results.push({ ...r, status, user_id: user?.id ?? '', message })
      console.log(`[${index+1}/${records.length}] ${status}: ${email} -> ${entityCode}`)
      continue
    }

    if (!user) {
      if (!password) throw new Error('Missing temporary_password for a new Auth user')
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role, source: 'ZE CenterOS bulk account import' }
      })
      if (error) throw error
      user = data.user
      authByEmail.set(email, user)
      status = 'created'
    } else {
      status = 'existing'
    }
    userId = user.id

    const { error: profileError } = await admin.from('profiles').upsert({
      id: userId, full_name: fullName, role, is_active: true, updated_at: new Date().toISOString()
    }, { onConflict: 'id' })
    if (profileError) throw profileError

    const table = entityType === 'teacher' ? 'teachers' : 'students'
    const codeColumn = 'code'
    const { data: entity, error: entityReadError } = await admin.from(table)
      .select('id,user_id,email,code,full_name').eq(codeColumn, entityCode).maybeSingle()
    if (entityReadError) throw entityReadError
    if (!entity) throw new Error(`${table} record not found for code ${entityCode}`)
    if (entity.user_id && entity.user_id !== userId && !forceRelink) {
      throw new Error(`${entityCode} is already linked to another Auth user. Use --force-relink only after manual verification.`)
    }

    const { error: updateError } = await admin.from(table).update({
      user_id: userId, email, updated_at: new Date().toISOString()
    }).eq('id', entity.id)
    if (updateError) throw updateError

    status = status === 'created' ? 'created_and_linked' : 'existing_and_linked'
    console.log(`[${index+1}/${records.length}] ${status}: ${email} -> ${entityCode}`)
  } catch (err) {
    status = 'error'
    message = err?.message || String(err)
    console.error(`[${index+1}/${records.length}] ERROR ${email}: ${message}`)
  }
  results.push({ ...r, status, user_id: userId, message })
}

const outDir = path.join(root, 'results')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, `bulk-auth-result-${new Date().toISOString().replaceAll(':','-')}.csv`)
const headers = [...Object.keys(records[0] ?? {}), 'status', 'user_id', 'message']
fs.writeFileSync(outPath, '\uFEFF' + [headers, ...results.map(r => headers.map(h => r[h] ?? ''))].map(row => row.map(csvEscape).join(',')).join('\n'))

const errors = results.filter(r => r.status === 'error').length
console.log(`Done. ${results.length-errors} successful/planned, ${errors} errors.`)
console.log(`Result log: ${outPath}`)
if (errors) process.exitCode = 2
