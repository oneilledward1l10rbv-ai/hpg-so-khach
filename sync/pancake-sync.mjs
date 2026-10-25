// HPG CRM — đồng bộ khách từ Pancake (pages.fm) vào Supabase.
// - Khách mới để lại SĐT: tạo khách, ghi tin nhắn vào Ghi chú theo ngày, tự nhận diện Mô hình / Dịch vụ / Khu vực.
// - Khách đã có (trùng SĐT): bổ sung tin nhắn còn thiếu vào Ghi chú, điền Mô hình / Dịch vụ / Khu vực nếu đang trống.
// Chạy bằng GitHub Actions. Repo công khai nên log chỉ in số lượng, không in tên / SĐT / nội dung tin nhắn.
const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const PAGES = (process.env.PANCAKE_PAGES || "").split(/\n|;/).map(s => s.trim()).filter(Boolean)
  .map(l => { const [id, token, ...name] = l.split("|").map(x => x.trim()); return { id, token, name: name.join("|") || "Fanpage" }; });
const OWNER = process.env.CRM_DEFAULT_OWNER || "";
const LOOKBACK_H = Number(process.env.LOOKBACK_HOURS || 48);
const NOTE_MARK = "Từ ghi chú";

if (!SUPABASE_URL || !KEY || !PAGES.length) { console.error("Thiếu SUPABASE_URL / SUPABASE_SERVICE_KEY / PANCAKE_PAGES"); process.exit(1); }
const H = { apikey: KEY, "Content-Type": "application/json", ...(KEY.startsWith("eyJ") ? { Authorization: `Bearer ${KEY}` } : {}) };
const rest = (path, init = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stats = { conv: 0, convMatched: 0, msgCalls: 0, msgOk: 0, msgErr: {}, withMsgs: 0, added: 0, enriched: 0, seen: 0, dup: 0 };

const normPhone = p => { let d = String(p?.phone_number ?? p?.phone ?? p ?? "").replace(/\D/g, ""); if (d.startsWith("84") && d.length === 11) d = "0" + d.slice(2); return /^0\d{9,10}$/.test(d) ? d : ""; };
const vnDate = iso => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(iso ? new Date(iso) : new Date());
const ddmm = day => { const [, m, d] = day.split("-"); return `${d}/${m}`; };
const clean = t => String(t || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const lc = t => String(t || "").toLowerCase();
const arr = v => Array.isArray(v) ? v : v ? [v] : [];

function detect(text) {
  const t = lc(text); const pick = rules => (rules.find(([re]) => re.test(t)) || [])[1] || "";
  return {
    model: pick([
      [/nha khoa|răng|niềng|implant|nha sĩ/, "Nha khoa"],
      [/da liễu|da lieu|mụn|nám|laser|hifu|thermage|trị da|chăm sóc da/, "Phòng khám da liễu"],
      [/yhct|y học cổ truyền|đông y|châm cứu|chẩn trị|bấm huyệt|lương y|thuốc nam|thuốc bắc|cổ truyền/, "Phòng chẩn trị YHCT"],
      [/phẫu thuật thẩm mỹ|pttm|nâng ngực|nâng mũi|hút mỡ|cắt mí|tiểu phẫu/, "Phòng khám thẩm mỹ"],
      [/bệnh viện/, "Bệnh viện thẩm mỹ"],
      [/đa khoa/, "Phòng khám đa khoa"],
      [/spa|thẩm mỹ viện|\btmv\b|clinic|phun xăm|massage|thẩm mỹ/, "Spa / Thẩm mỹ viện"],
      [/chuyên khoa|nam khoa|sản phụ|phụ khoa|nhi khoa|khám nhi|tai mũi họng|nhãn khoa|vật lý trị liệu|tiêm chủng|tiêm ngừa|xét nghiệm/, "Phòng khám chuyên khoa"],
    ]),
    service: pick([
      [/bác sĩ đứng tên|bs đứng tên|người chịu trách nhiệm chuyên môn|thuê bác sĩ|thuê bs|đứng tên chuyên môn/, "Bác sĩ đứng tên chuyên môn"],
      [/quảng cáo|marketing|chạy ads|\bads\b|kéo khách|tiktok|content|truyền thông|ra khách/, "Marketing FB + TikTok"],
      [/giấy phép hoạt động|gphđ|gphd|thẩm định|sở y tế|\bsyt\b|cấp phép|xin phép|giấy phép/, "Pháp lý - Giấy phép hoạt động"],
      [/thành lập|mở phòng khám|mở pk|mở spa|mở cơ sở|mở phòng|đăng ký kinh doanh|gpkd|giấy tờ|thủ tục|pháp lý|hồ sơ/, "Pháp lý - Thành lập cơ sở"],
    ]),
    region: pick([
      [/hà nội|\bhn\b/, "Hà Nội"], [/cần thơ/, "Cần Thơ"], [/đà nẵng/, "Đà Nẵng"], [/đồng nai|biên hòa|biên hoà/, "Đồng Nai"], [/vũng tàu|bà rịa/, "Vũng Tàu"],
      [/tây ninh/, "Tây Ninh"], [/an giang|kiên giang|rạch giá|long xuyên|phú quốc/, "An Giang"],
      [/hcm|hồ chí minh|sài gòn|\bsg\b|quận \d|\bq\.? ?\d|thủ đức|bình tân|bình thạnh|gò vấp|tân bình|tân phú|phú nhuận|củ chi|hóc môn|nhà bè|bình chánh/, "TP.HCM"],
    ]),
  };
}

async function pancakeCustomers(page) {
  const until = Math.floor(Date.now() / 1000), since = until - LOOKBACK_H * 3600; const out = [];
  for (let n = 1; n <= 20; n++) {
    const u = `https://pages.fm/api/public_api/v1/pages/${encodeURIComponent(page.id)}/page_customers?page_access_token=${encodeURIComponent(page.token)}&since=${since}&until=${until}&page_number=${n}&page_size=100&order_by=updated_at`;
    const r = await fetch(u); if (!r.ok) { console.error(`Pancake (khách) trả lỗi ${r.status} cho trang "${page.name}"`); break; }
    const j = await r.json(); const list = j.customers || []; out.push(...list); if (list.length < 100) break; await sleep(250);
  }
  return out;
}

// Danh sách hội thoại gần đây → bản đồ psid / SĐT → mã hội thoại thật
async function conversationIndex(page) {
  const byPsid = new Map(), byPhone = new Map(); const sinceMs = Date.now() - LOOKBACK_H * 3600e3; let last = "";
  for (let n = 0; n < 15; n++) {
    const u = `https://pages.fm/api/public_api/v2/pages/${encodeURIComponent(page.id)}/conversations?page_access_token=${encodeURIComponent(page.token)}&order_by=updated_at&type=INBOX${last ? `&last_conversation_id=${encodeURIComponent(last)}` : ""}`;
    const r = await fetch(u); if (!r.ok) { console.error(`Pancake (hội thoại) trả lỗi ${r.status} cho trang "${page.name}"`); break; }
    const j = await r.json(); const list = j.conversations || j.data || []; if (!list.length) break;
    for (const c of list) {
      if (!c?.id) continue; stats.conv++;
      const ids = [c.from?.id, c.psid, c.from_psid, c.page_customer?.psid, ...arr(c.customers).flatMap(x => [x?.fb_id, x?.psid, x?.id])].filter(Boolean).map(String);
      ids.forEach(id => { if (!byPsid.has(id)) byPsid.set(id, c.id); });
      const phones = [...arr(c.recent_phone_numbers), ...arr(c.participants).map(p => p?.phone), ...arr(c.phone_numbers)].map(normPhone).filter(Boolean);
      phones.forEach(p => { if (!byPhone.has(p)) byPhone.set(p, c.id); });
    }
    last = list[list.length - 1].id; const oldest = Date.parse(list[list.length - 1].updated_at || "");
    if (list.length < 60 || (oldest && oldest < sinceMs)) break; await sleep(250);
  }
  return { byPsid, byPhone };
}

async function fetchMessages(page, convId) {
  stats.msgCalls++;
  const r = await fetch(`https://pages.fm/api/public_api/v1/pages/${encodeURIComponent(page.id)}/conversations/${encodeURIComponent(convId)}/messages?page_access_token=${encodeURIComponent(page.token)}`);
  if (!r.ok) { stats.msgErr[r.status] = (stats.msgErr[r.status] || 0) + 1; return null; }
  stats.msgOk++; const j = await r.json().catch(() => ({})); return j.messages || j.data || [];
}

async function customerMessages(page, cu, idx, phones) {
  const cands = [];
  const psids = [cu.psid, cu.fb_id, cu.customer_id].filter(Boolean).map(String);
  psids.forEach(p => idx.byPsid.has(p) && cands.push(idx.byPsid.get(p)));
  phones.forEach(p => idx.byPhone.has(p) && cands.push(idx.byPhone.get(p)));
  if (cands.length) stats.convMatched++;
  psids.forEach(p => cands.push(`${page.id}_${p}`));
  for (const id of [...new Set(cands)]) {
    const msgs = await fetchMessages(page, id); await sleep(220);
    if (!msgs) continue;
    const mine = msgs.filter(m => m && !m.is_removed && String(m.from?.id || "") !== String(page.id) && clean(m.message || m.original_message || m.text))
      .map(m => ({ at: m.inserted_at || m.created_at, text: clean(m.message || m.original_message || m.text) }))
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
    if (mine.length) { stats.withMsgs++; return mine; }
    if (msgs.length) return [];
  }
  return [];
}

function noteLines(msgs, pageName) {
  const byDay = new Map();
  for (const m of msgs.slice(-15)) { const k = vnDate(m.at); const a = byDay.get(k) || []; a.push(m.text.slice(0, 240)); byDay.set(k, a); }
  return [...byDay.entries()].map(([day, a]) => ({ day, text: a.join(" · "), line: `${ddmm(day)} Inbox (${pageName}): ${a.join(" · ")}` }));
}
async function insertActs(id, lines) {
  const rows = lines.map((l, i) => ({ client_id: id, date: l.day, channel: "Inbox Facebook", content: `Inbox: ${l.text}`, result: "", created_by_email: NOTE_MARK, created_at: Date.now() + i }));
  if (rows.length) await rest("activities", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows) });
}

async function main() {
  const cr = await rest("clients?select=id,phone,note,model,service,region,date");
  if (!cr.ok) { console.error("Không đọc được danh sách khách từ Supabase:", cr.status); process.exit(1); }
  const clients = await cr.json();
  const byPhone = new Map(clients.map(c => [normPhone(c.phone), c]).filter(([p]) => p));
  let maxN = Math.max(0, ...clients.map(c => parseInt(String(c.id).replace(/\D/g, ""), 10) || 0));

  for (const page of PAGES) {
    const [custs, idx] = await Promise.all([pancakeCustomers(page), conversationIndex(page)]);
    for (const cu of custs) {
      const phones = arr(cu.phone_numbers).map(normPhone).filter(Boolean); if (!phones.length) continue; stats.seen++;
      const ex = phones.map(p => byPhone.get(p)).find(Boolean);
      const msgs = await customerMessages(page, cu, idx, phones);
      const lines = noteLines(msgs, page.name);
      const info = detect(msgs.map(m => m.text).join(" ") + " " + (cu.lives_in || ""));
      const firstDay = [msgs[0]?.at, cu.inserted_at].filter(Boolean).map(vnDate).sort()[0] || vnDate(); // ngày đầu tiên khách nhắn

      if (ex) { // khách đã có: bổ sung phần còn thiếu, không ghi đè
        stats.dup++;
        const note = String(ex.note || "");
        const missing = lines.filter(l => !note.includes(l.text.slice(0, 40)));
        const patch = {};
        if (missing.length) patch.note = (note.trim() ? note.trimEnd() + "\n" : "") + missing.map(l => l.line).join("\n");
        if (!ex.model && info.model) patch.model = info.model;
        if (!ex.service && info.service) patch.service = info.service;
        if (!ex.region && info.region) patch.region = info.region;
        if (firstDay && (!ex.date || firstDay < String(ex.date).slice(0, 10))) patch.date = firstDay;
        if (Object.keys(patch).length) {
          patch.updated_at = Date.now();
          const r = await rest(`clients?id=eq.${encodeURIComponent(ex.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) });
          if (r.ok) { stats.enriched++; Object.assign(ex, patch); if (missing.length) await insertActs(ex.id, missing); }
          else console.error("Lỗi cập nhật khách:", r.status);
        }
        continue;
      }

      const date = firstDay, today = vnDate(); let ok = false;
      for (let tries = 0; tries < 5 && !ok; tries++) {
        const id = "KH" + String(++maxN).padStart(3, "0");
        const body = { id, date, contact: cu.name || "Khách Pancake", phone: phones[0], status: "1. Mới tiếp nhận", source: "Fanpage / Inbox", owner: OWNER, priority: "Ấm",
          region: info.region, model: info.model, service: info.service,
          next_action: `Gọi tư vấn lần đầu — data mới từ ${page.name}`, next_date: today, note: lines.map(l => l.line).join("\n"), updated_at: Date.now() };
        const r = await rest("clients", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) });
        if (r.status === 409) continue;
        if (!r.ok) { const t = await r.text(); console.error("Lỗi tạo khách:", r.status, t.slice(0, 200).replace(/\d{9,}/g, "***")); break; }
        ok = true; stats.added++; const rec = { ...body }; phones.forEach(p => byPhone.set(p, rec));
        if (lines.length) await insertActs(id, lines);
        else await rest("activities", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ client_id: id, date, channel: "Inbox Facebook", content: `Khách để lại số điện thoại qua ${page.name} (Pancake)`, result: "", created_by_email: "Pancake", created_at: Date.now() }) });
      }
    }
  }
  console.log(`Xong (${LOOKBACK_H} giờ qua): ${PAGES.length} trang · ${stats.seen} khách có SĐT · ${stats.added} khách mới · ${stats.dup} đã có (${stats.enriched} được bổ sung tin nhắn / mô hình / dịch vụ).`);
  console.log(`Chi tiết: ${stats.conv} hội thoại đọc được · ${stats.convMatched} khách khớp hội thoại · ${stats.msgOk}/${stats.msgCalls} lần đọc tin nhắn thành công${Object.keys(stats.msgErr).length ? " · lỗi " + JSON.stringify(stats.msgErr) : ""} · ${stats.withMsgs} khách có tin nhắn.`);
}
main().catch(e => { console.error("Lỗi:", e.message); process.exit(1); });
