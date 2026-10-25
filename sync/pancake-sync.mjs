// HPG CRM — đồng bộ khách để lại SĐT từ Pancake (pages.fm) vào Supabase.
// Chạy bằng GitHub Actions (xem .github/workflows/pancake-sync.yml). Không in tên / SĐT khách ra log (repo công khai).
const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const PAGES = (process.env.PANCAKE_PAGES || "").split(/\n|;/).map(s => s.trim()).filter(Boolean)
  .map(l => { const [id, token, ...name] = l.split("|").map(x => x.trim()); return { id, token, name: name.join("|") || "Fanpage" }; });
const OWNER = process.env.CRM_DEFAULT_OWNER || "";
const LOOKBACK_H = Number(process.env.LOOKBACK_HOURS || 48);

if (!SUPABASE_URL || !KEY || !PAGES.length) { console.error("Thiếu SUPABASE_URL / SUPABASE_SERVICE_KEY / PANCAKE_PAGES"); process.exit(1); }
const H = { apikey: KEY, "Content-Type": "application/json", ...(KEY.startsWith("eyJ") ? { Authorization: `Bearer ${KEY}` } : {}) };
const rest = (path, init = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });

const normPhone = p => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("84") && d.length === 11) d = "0" + d.slice(2); return /^0\d{9,10}$/.test(d) ? d : ""; };
const vnDate = iso => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(iso ? new Date(iso) : new Date());
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function pancakeCustomers(page) {
  const until = Math.floor(Date.now() / 1000), since = until - LOOKBACK_H * 3600; const out = [];
  for (let n = 1; n <= 10; n++) {
    const u = `https://pages.fm/api/public_api/v1/pages/${encodeURIComponent(page.id)}/page_customers?page_access_token=${encodeURIComponent(page.token)}&since=${since}&until=${until}&page_number=${n}&page_size=100&order_by=updated_at`;
    const r = await fetch(u); if (!r.ok) { console.error(`Pancake trả lỗi ${r.status} cho trang "${page.name}"`); break; }
    const j = await r.json(); const list = j.customers || []; out.push(...list); if (list.length < 100) break; await sleep(250);
  }
  return out;
}

async function main() {
  const cr = await rest("clients?select=id,phone"); if (!cr.ok) { console.error("Không đọc được danh sách khách từ Supabase:", cr.status); process.exit(1); }
  const clients = await cr.json();
  const known = new Set(clients.map(c => normPhone(c.phone)).filter(Boolean));
  let maxN = Math.max(0, ...clients.map(c => parseInt(String(c.id).replace(/\D/g, ""), 10) || 0));
  let added = 0, seen = 0, dup = 0;
  for (const page of PAGES) {
    const custs = await pancakeCustomers(page);
    for (const cu of custs) {
      const phones = (cu.phone_numbers || []).map(normPhone).filter(Boolean); if (!phones.length) continue; seen++;
      if (phones.some(p => known.has(p))) { dup++; continue; }
      const phone = phones[0]; const date = vnDate(cu.inserted_at); const today = vnDate();
      let ok = false;
      for (let tries = 0; tries < 5 && !ok; tries++) {
        const id = "KH" + String(++maxN).padStart(3, "0");
        const body = { id, date, contact: cu.name || "Khách Pancake", phone, status: "1. Mới tiếp nhận", source: "Fanpage / Inbox", owner: OWNER, priority: "Ấm",
          region: cu.lives_in || "", next_action: `Gọi tư vấn — khách để lại SĐT qua ${page.name}`, next_date: today, note: "", updated_at: Date.now() };
        const r = await rest("clients", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) });
        if (r.status === 409) continue;
        if (!r.ok) { const t = await r.text(); console.error("Lỗi tạo khách:", r.status, t.slice(0, 200).replace(/\d{9,}/g, "***")); break; }
        ok = true; added++; known.add(phone);
        await rest("activities", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ client_id: id, date, channel: "Inbox Facebook", content: `Khách để lại số điện thoại qua ${page.name} (Pancake)`, result: "", created_by_email: "Pancake", created_at: Date.now() }) });
      }
    }
  }
  console.log(`Xong: ${PAGES.length} trang, ${seen} khách có SĐT trong ${LOOKBACK_H} giờ qua, ${dup} đã có trong CRM, ${added} khách mới được thêm.`);
}
main().catch(e => { console.error("Lỗi:", e.message); process.exit(1); });
