/**
 * Export a client dossier as a formatted HTML that opens print dialog (PDF).
 * Uses window.print() — no external library needed.
 */
interface ClientData {
  full_name: string
  phone: string
  email?: string | null
  pipeline_stage: string
  source?: string
  confirmed_budget?: number | null
  interest_level?: string
  payment_method?: string
  agent_name?: string
  created_at: string
}

interface PaymentSchedule {
  description: string
  amount: number
  due_date: string
  status: string
}

interface HistoryEntry {
  title: string
  type: string
  created_at: string
}

export function exportClientPdf(
  client: ClientData,
  schedules: PaymentSchedule[],
  history: HistoryEntry[],
  agencyName = 'IMMO PRO-X'
) {
  const formatPrice = (n: number) => n.toLocaleString('fr') + ' DA'
  const formatDate = (s: string) => new Date(s).toLocaleDateString('fr', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const totalPaid = schedules.filter(s => s.status === 'paid').reduce((sum, s) => sum + s.amount, 0)
  const totalDue = schedules.filter(s => s.status !== 'paid').reduce((sum, s) => sum + s.amount, 0)

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Dossier Client — ${client.full_name}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,sans-serif;color:#0A2540;padding:40px;font-size:13px;line-height:1.6}
  h1{font-size:22px;margin-bottom:4px}
  h2{font-size:16px;margin:24px 0 10px;padding-bottom:6px;border-bottom:2px solid #0579DA;color:#0579DA}
  table{width:100%;border-collapse:collapse;margin:8px 0 16px}
  th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #E3E8EF;font-size:12px}
  th{background:#F6F9FC;font-weight:600;color:#425466}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .field{margin-bottom:8px}
  .field .label{font-size:10px;color:#8898AA;text-transform:uppercase;letter-spacing:.5px}
  .field .value{font-size:13px;font-weight:600}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px}
  .logo{font-size:18px;font-weight:800;color:#0579DA}
  .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
  .green{background:#00D4A015;color:#00D4A0}.red{background:#CD3D6415;color:#CD3D64}.orange{background:#F5A62315;color:#F5A623}.blue{background:#0579DA15;color:#0579DA}
  .total-row td{font-weight:700;border-top:2px solid #0A2540}
  @media print{body{padding:20px}h2{break-before:auto}}
</style></head><body>
<div class="header">
  <div><div class="logo">${agencyName}</div><p style="color:#8898AA;font-size:11px">Dossier Client — Genere le ${formatDate(new Date().toISOString())}</p></div>
  <div style="text-align:right"><p style="font-size:11px;color:#8898AA">Ref: ${client.full_name.replace(/\s+/g, '-').toUpperCase()}</p></div>
</div>

<h1>${client.full_name}</h1>
<p style="color:#425466">${client.phone} ${client.email ? '· ' + client.email : ''}</p>

<h2>Informations</h2>
<div class="grid">
  <div class="field"><div class="label">Etape pipeline</div><div class="value">${client.pipeline_stage}</div></div>
  <div class="field"><div class="label">Source</div><div class="value">${client.source ?? '-'}</div></div>
  <div class="field"><div class="label">Budget confirme</div><div class="value">${client.confirmed_budget ? formatPrice(client.confirmed_budget) : '-'}</div></div>
  <div class="field"><div class="label">Niveau d'interet</div><div class="value">${client.interest_level ?? '-'}</div></div>
  <div class="field"><div class="label">Mode de paiement</div><div class="value">${client.payment_method ?? '-'}</div></div>
  <div class="field"><div class="label">Agent assigne</div><div class="value">${client.agent_name ?? '-'}</div></div>
  <div class="field"><div class="label">Date de creation</div><div class="value">${formatDate(client.created_at)}</div></div>
</div>

${schedules.length > 0 ? `
<h2>Echeancier de paiement</h2>
<table>
  <thead><tr><th>Description</th><th>Montant</th><th>Echeance</th><th>Statut</th></tr></thead>
  <tbody>
    ${schedules.map(s => `<tr><td>${s.description}</td><td>${formatPrice(s.amount)}</td><td>${formatDate(s.due_date)}</td><td><span class="badge ${s.status === 'paid' ? 'green' : s.status === 'late' ? 'red' : 'orange'}">${s.status === 'paid' ? 'Paye' : s.status === 'late' ? 'En retard' : 'En attente'}</span></td></tr>`).join('')}
    <tr class="total-row"><td>Paye</td><td colspan="3" style="color:#00D4A0">${formatPrice(totalPaid)}</td></tr>
    <tr class="total-row"><td>Restant</td><td colspan="3" style="color:#F5A623">${formatPrice(totalDue)}</td></tr>
  </tbody>
</table>` : ''}

${history.length > 0 ? `
<h2>Historique des interactions</h2>
<table>
  <thead><tr><th>Date</th><th>Type</th><th>Details</th></tr></thead>
  <tbody>
    ${history.slice(0, 20).map(h => `<tr><td>${formatDate(h.created_at)}</td><td>${h.type}</td><td>${h.title}</td></tr>`).join('')}
  </tbody>
</table>` : ''}

<div style="margin-top:40px;padding-top:16px;border-top:1px solid #E3E8EF;color:#8898AA;font-size:10px;text-align:center">
  Document genere par ${agencyName} · ${new Date().toLocaleDateString('fr')} · Confidentiel
</div>
</body></html>`

  // Open in new window and trigger print
  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
    win.setTimeout(() => win.print(), 500)
  }
}
