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
const NOTE_MARK = "Từ ghi chú";
const lc = t => String(t || "").toLowerCase();
function detect(text) {
  const t = lc(text); const pick = rules => (rules.find(([re]) => re.test(t)) || [])[1] || "";
  const model = pick([
    [/nha khoa|răng|niềng|implant|nha sĩ/, "Nha khoa"],
    [/da liễu|da lieu|mụn|nám|laser|hifu|thermage|trị da/, "Phòng khám da liễu"],
    [/yhct|y học cổ truyền|đông y|châm cứu|chẩn trị|bấm huyệt|lương y|thuốc nam|thuốc bắc/, "Phòng chẩn trị YHCT"],
    [/phẫu thuật thẩm mỹ|pttm|nâng ngực|nâng mũi|hút mỡ|cắt mí|tiểu phẫu/, "Phòng khám thẩm mỹ"],
    [/bệnh viện/, "Bệnh viện thẩm mỹ"],
    [/đa khoa/, "Phòng khám đa khoa"],
    [/spa|thẩm mỹ viện|\btmv\b|clinic|phun xăm|massage/, "Spa / Thẩm mỹ viện"],
    [/chuyên khoa|nam khoa|sản phụ|phụ khoa|nhi khoa|tai mũi họng|nhãn khoa|vật lý trị liệu|tiêm chủng|tiêm ngừa/, "Phòng khám chuyên khoa"],
  ]);
  const service = pick([
    [/bác sĩ đứng tên|bs đứng tên|người chịu trách nhiệm chuyên môn|thuê bác sĩ|thuê bs/, "Bác sĩ đứng tên chuyên môn"],
    [/quảng cáo|marketing|chạy ads|\bads\b|kéo khách|tiktok|fanpage|content|truyền thông/, "Marketing FB + TikTok"],
    [/giấy phép hoạt động|gphđ|gphd|thẩm định|sở y tế|\bsyt\b|cấp phép|xin phép/, "Pháp lý - Giấy phép hoạt động"],
    [/thành lập|mở phòng khám|mở pk|mở spa|mở cơ sở|đăng ký kinh doanh|gpkd|giấy tờ|thủ tục|pháp lý/, "Pháp lý - Thành lập cơ sở"],
  ]);
  const region = pick([
    [/hà nội|hn\b/, "Hà Nội"], [/cần thơ/, "Cần Thơ"], [/đà nẵng/, "Đà Nẵng"], [/đồng nai|biên hòa|biên hoà/, "Đồng Nai"], [/vũng tàu|bà rịa/, "Vũng Tàu"], [/tây ninh/, "Tây Ninh"], [/an giang|kiên giang|rạch giá|long xuyên/, "An Giang"],
    [/hcm|hồ chí minh|sài gòn|sg\b|quận \d|q\.? ?\d|thủ đức|bình tân|bình thạnh|gò vấp|tân bình|tân phú|phú nhuận|củ chi|hóc môn|nhà bè|bình chánh/, "TP.HCM"],
  ]);
  return { model, service, region };
}
async function customerMessages(page, cu) {
  if (!cu.psid) return [];
  const conv = `${page.id}_${cu.psid}`;
  const r = await fetch(`https://pages.fm/api/public_api/v1/pages/${encodeURIComponent(page.id)}/conversations/${encodeURIComponent(conv)}/messages?page_access_token=${encodeURIComponent(page.token)}`);
  if (!r.ok) return [];
  const j = await r.json().catch(() => ({})); const msgs = j.messages || [];
  return msgs.filter(m => m && m.message && !m.is_removed && String(m.from?.id || "") !== String(page.id))
    .map(m => ({ at: m.inserted_at, text: String(m.message).replace(/\s+/g, " ").trim() })).filter(m => m.text)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
const ddmm = iso => { const [y, m, d] = vnDate(iso).split("-"); return `${d}/${m}`; };
function buildNote(msgs, pageName) {
  const byDay = new Map();
  for (const m of msgs.slice(-12)) { const k = vnDate(m.at); const arr = byDay.get(k) || []; arr.push(m.text.slice(0, 220)); byDay.set(k, arr); }
  return [...byDay.entries()].map(([k, arr]) => `${ddmm(k)} Inbox (${pageName}): ${arr.join(" · ")}`).join("\n");
}

async function pancakeCustomers(page) {
  const until = Math.floor(Date.now() / 1000), since = until - LOOKBACK_H * 3600; const out = [];
  for (let n = 1; n <= 10; n++) {
    const u = `https://pages.fm/api/public_api/v1/pages/${encodeURIComponent(page.id)}/page_customers?page_access_token=${encodeURIComponent(page.token)}&since=${since}&until=${until}&page_number=${n}&page_size=100&order_by=updated_at`;
    const r = await fetch(u); if (!r.ok) { console.error(`Pancake trả lỗi ${r.status} cho trang "${page.name}"`); break; }
    const j = await r.json(); const list = j.customers || []; out.push(...list); if (list.length < 100) break; await sleep(250);
  }
  return out;
}

async function insertNoteActs(id, msgs, pageName) {
  const byDay = new Map(); for (const m of msgs.slice(-12)) { const k = vnDate(m.at); const a = byDay.get(k) || []; a.push(m.text.slice(0, 220)); byDay.set(k, a); }
  const rows = [...byDay.entries()].map(([k, a], i) => ({ client_id: id, date: k, channel: "Inbox Facebook", content: `Inbox (${pageName}): ${a.join(" · ")}`, result: "", created_by_email: NOTE_MARK, created_at: Date.now() + i }));
  if (rows.length) await rest("activities", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows) });
}
async function main() {
  const cr = await rest("clients?select=id,phone,note,model,service,date,last_contact"); if (!cr.ok) { console.error("Không đọc được danh sách khách từ Supabase:", cr.status); process.exit(1); }
  const clients = await cr.json();
  const known = new Set(clients.map(c => normPhone(c.phone)).filter(Boolean));
  const byPhone = new Map(clients.map(c => [normPhone(c.phone), c]).filter(([p]) => p));
  let enriched = 0;
  let maxN = Math.max(0, ...clients.map(c => parseInt(String(c.id).replace(/\D/g, ""), 10) || 0));
  let added = 0, seen = 0, dup = 0;
  for (const page of PAGES) {
    const custs = await pancakeCustomers(page);
    for (const cu of custs) {
      const phones = (cu.phone_numbers || []).map(normPhone).filter(Boolean); if (!phones.length) continue; seen++;
      if (phones.some(p => known.has(p))) {
        dup++; const ex = phones.map(p => byPhone.get(p)).find(Boolean);
        if (ex && !ex.note && !ex.model && !ex.service && !ex.last_contact) {
          const msgs = await customerMessages(page, cu); await sleep(220); if (!msgs.length) continue;
          const info = detect(msgs.map(m => m.text).join(" ")); const note = buildNote(msgs, page.name);
          const patch = { note, ...(info.model ? { model: info.model } : {}), ...(info.service ? { service: info.service } : {}), updated_at: Date.now() };
          const r = await rest(`clients?id=eq.${encodeURIComponent(ex.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) });
          if (r.ok) { enriched++; ex.note = note; await insertNoteActs(ex.id, msgs, page.name); }
        }
        continue;
      }
      const phone = phones[0]; const date = vnDate(cu.inserted_at); const today = vnDate();
      const msgs = await customerMessages(page, cu); await sleep(220);
      const info = detect(msgs.map(m => m.text).join(" ") + " " + (cu.lives_in || ""));
      const note = buildNote(msgs, page.name);
      let ok = false;
      for (let tries = 0; tries < 5 && !ok; tries++) {
        const id = "KH" + String(++maxN).padStart(3, "0");
        const body = { id, date, contact: cu.name || "Khách Pancake", phone, status: "1. Mới tiếp nhận", source: "Fanpage / Inbox", owner: OWNER, priority: "Ấm",
          region: info.region || "", model: info.model, service: info.service,
          next_action: `Gọi tư vấn lần đầu — data mới từ ${page.name}`, next_date: today, note, updated_at: Date.now() };
        const r = await rest("clients", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) });
        if (r.status === 409) continue;
        if (!r.ok) { const t = await r.text(); console.error("Lỗi tạo khách:", r.status, t.slice(0, 200).replace(/\d{9,}/g, "***")); break; }
        ok = true; added++; known.add(phone);
        if (msgs.length) await insertNoteActs(id, msgs, page.name);
        else await rest("activities", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ client_id: id, date, channel: "Inbox Facebook", content: `Khách để lại số điện thoại qua ${page.name} (Pancake)`, result: "", created_by_email: "Pancake", created_at: Date.now() }) });
      }
    }
  }
  console.log(`Xong: ${PAGES.length} trang, ${seen} khách có SĐT trong ${LOOKBACK_H} giờ qua, ${dup} đã có trong CRM (${enriched} được bổ sung tin nhắn), ${added} khách mới được thêm.`);
}
main().catch(e => { console.error("Lỗi:", e.message); process.exit(1); });
