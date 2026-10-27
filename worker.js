/**
 * 24Adz.com Cloudflare Worker API
 * Required:
 *   D1 binding: DB
 *   Secret: ADMIN_API_TOKEN
 *   Variable: ALLOWED_ORIGIN -> https://24adz.com
 */

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function response(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "Content-Type,Authorization",
      "vary": "Origin" }
  });
}

function fail(message, status, origin) { 
  return response({ ok: false, error: message }, status, origin); 
}

function safeOrigin(request, env) {
  const requestOrigin = request.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGIN || "https://24adz.com";
  return requestOrigin === allowed ? allowed : allowed;
}

function isAdmin(request, env) {
  const configured = env.ADMIN_API_TOKEN;
  const auth = request.headers.get("Authorization") || "";
  return !!configured && auth === `Bearer ${configured}`;
}function slugify(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeStatus(status) {
  const s = String(status || "Pending").toLowerCase();
  return ({ pending: "pending", active: "active", rejected: "rejected", expired: "expired" })[s] || "pending";
}

function adminShape(row) {
  return {
    id: row.id, title: row.title, description: row.description || "",
    category: row.category, district: row.district, area: row.area || "",
    price: row.price_paise == null ? 0 : row.price_paise / 100,
    status: ({pending:"Pending",active:"Active",rejected:"Rejected",expired:"Expired",draft:"Pending",blocked:"Rejected",deleted:"Rejected"})[row.status] || "Pending",
    expiry: row.expires_at ? String(row.expires_at).slice(0,10) : "",
    vip: !!(row.is_vip || row.is_featured),
    name: row.contact_name || "", phone: row.contact_phone_e164 || "",
    whatsapp: row.whatsapp_enabled ? (row.contact_phone_e164 || "") : ""
  };
}

async function lookupId(db, table, name) {
  const column = table === "categories" ? "name" : "name";
  const row = await db.prepare(`SELECT id FROM ${table} WHERE lower(${column})=lower(?) AND is_active=1 LIMIT 1`).bind(name).first();
  return row?.id ?? null;
}async function listAds(db, url, admin = false) {
  const params = [];
  let where = admin ? "1=1" : "a.status='active' AND (a.expires_at IS NULL OR a.expires_at >= datetime('now')) AND a.deleted_at IS NULL";
  const district = url.searchParams.get("district");
  const category = url.searchParams.get("category");
  if (district) { where += " AND lower(d.name)=lower(?)"; params.push(district); }
  if (category) { where += " AND lower(c.name)=lower(?)"; params.push(category); }
  const result = await db.prepare(`
    SELECT a.id,a.title,a.description,a.price_paise,a.status,a.is_vip,a.is_featured,
           a.expires_at,a.created_at,a.contact_name,a.contact_phone_e164,a.whatsapp_enabled,
           c.name AS category,d.name AS district,ar.name AS area
    FROM ads a
    JOIN categories c ON c.id=a.category_id
    JOIN districts d ON d.id=a.district_id
    LEFT JOIN areas ar ON ar.id=a.area_id
    WHERE ${where}
    ORDER BY a.is_vip DESC, a.is_featured DESC, a.created_at DESC
    LIMIT 500
  `).bind(...params).all();
  return (result.results || []).map(row => {
    const item = adminShape(row);
    item.createdAt = row.created_at ? Date.parse(row.created_at) || Date.now() : Date.now();
    item.demo = false;
    return item;
  });
}

async function saveAd(request, env, id = null) {
  let body;
  try { body = await request.json(); } catch { return { error: "Invalid JSON body", status: 400 }; }
  const title = String(body.title || "").trim().slice(0,100);
  const category = String(body.category || "").trim();
  const district = String(body.district || "").trim();
  const area = String(body.area || "").trim().slice(0,100);
  const description = String(body.description || "").trim().slice(0,2000);
  if (!title || !category || !district || !area) return { error: "title, category, district and area are required", status: 400 };
  const categoryId = await lookupId(env.DB, "categories", category);
  const districtId = await lookupId(env.DB, "districts", district);
  if (!categoryId || !districtId) return { error: "Unknown category or district. Check the D1 seed data.", status: 400 };
  let areaId = null;
  const areaRow = await env.DB.prepare("SELECT id FROM areas WHERE district_id=? AND lower(name)=lower(?) AND is_active=1 LIMIT 1").bind(districtId, area).first();
  if (areaRow) areaId = areaRow.id;
  const price = body.price === "" || body.price == null ? null : Number(body.price);
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 100000000000)) return { error: "Invalid price", status: 400 };
  const status = normalizeStatus(body.status);
  const expiry = body.expiry ? `${String(body.expiry).slice(0,10)}T23:59:59.000Z` : null;
  const vip = body.vip === true || body.vip === "yes" || body.vip === 1;
  const phone = String(body.phone || "").trim().slice(0,20) || null;
  const name = String(body.name || "").trim().slice(0,100) || null;
  const now = new Date().toISOString();
  if (id) {
    const exists = await env.DB.prepare("SELECT id FROM ads WHERE id=? AND deleted_at IS NULL").bind(id).first();
    if (!exists) return { error: "Listing not found", status: 404 };
    await env.DB.prepare(`
      UPDATE ads SET title=?,description=?,price_paise=?,category_id=?,district_id=?,area_id=?,
      status=?,is_vip=?,expires_at=?,contact_name=?,contact_phone_e164=?,updated_at=?
      WHERE id=?
    `).bind(title,description,price === null ? null : Math.round(price*100),categoryId,districtId,areaId,status,vip?1:0,expiry,name,phone,now,id).run();
    return { id, status: 200 };
  }
  const newId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO ads (id,title,description,price_paise,category_id,district_id,area_id,status,is_vip,
      expires_at,contact_name,contact_phone_e164,contact_phone_verified,whatsapp_enabled,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,?)
  `).bind(newId,title,description,price === null ? null : Math.round(price*100),categoryId,districtId,areaId,status,vip?1:0,expiry,name,phone,now,now).run();
  return { id: newId, status: 201 };
    }export default {
  async fetch(request, env) {
    const origin = safeOrigin(request, env);
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": origin, "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "Content-Type,Authorization", "vary": "Origin"
    }});
    if (!url.pathname.startsWith("/api/")) return fail("Not found",404,origin);
    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        return response({ok:true,service:"24adz-api",database:!!env.DB},200,origin);
      }
      if (url.pathname === "/api/ads" && request.method === "GET") {
        if (!env.DB) return fail("D1 binding DB is missing",500,origin);
        return response({ok:true,ads:await listAds(env.DB,url,false)},200,origin);
      }
      if (url.pathname === "/api/admin/ads") {
        if (!isAdmin(request,env)) return fail("Unauthorized",401,origin);
        if (!env.DB) return fail("D1 binding DB is missing",500,origin);
        if (request.method === "GET") return response({ok:true,ads:await listAds(env.DB,url,true)},200,origin);
        if (request.method === "POST") {
          const result = await saveAd(request,env);
          return result.error ? fail(result.error,result.status,origin) : response({ok:true,id:result.id},result.status,origin);
        }
      }
      const match = url.pathname.match(/^\/api\/admin\/ads\/([A-Za-z0-9_-]+)$/);
      if (match) {
        if (!isAdmin(request,env)) return fail("Unauthorized",401,origin);
        if (request.method === "PUT") {
          const result = await saveAd(request,env,match[1]);
          return result.error ? fail(result.error,result.status,origin) : response({ok:true,id:result.id},200,origin);
        }
        if (request.method === "DELETE") {
          const result = await env.DB.prepare("UPDATE ads SET status='deleted',deleted_at=?,updated_at=? WHERE id=? AND deleted_at IS NULL").bind(new Date().toISOString(),new Date().toISOString(),match[1]).run();
          if (!result.meta?.changes) return fail("Listing not found",404,origin);
          return response({ok:true},200,origin);
        }
      }
      return fail("Method or route not allowed",405,origin);
    } catch (err) {
      return fail("Server error. Check Worker logs and D1 schema.",500,origin);
    }
  }
};
