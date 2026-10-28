/**
 * 24Adz.com Cloudflare Worker API — hardened version for the existing D1 schema.
 *
 * Required bindings/secrets:
 *   D1 binding: DB -> your 24Adz D1 database
 *   Secret: ADMIN_API_TOKEN -> long random secret (never commit to GitHub)
 *   Variable: ALLOWED_ORIGIN -> comma-separated allowed origins, for example:
 *     https://24adz.com,https://www.24adz.com,https://24adz-admin-panel.pages.dev
 *
 * Routes:
 *   GET    /api/health
 *   GET    /api/ads?district=Tiruppur&category=Cars
 *   GET    /api/categories
 *   GET    /api/districts
 *   GET    /api/areas?district=Tiruppur
 *   GET    /api/admin/ads                    (Bearer ADMIN_API_TOKEN)
 *   POST   /api/admin/ads                    (Bearer ADMIN_API_TOKEN)
 *   PUT    /api/admin/ads/:id                (Bearer ADMIN_API_TOKEN)
 *   DELETE /api/admin/ads/:id                (Bearer ADMIN_API_TOKEN; soft delete)
 *
 * Note: this API expects the current schema's columns: ads, categories, districts,
 * areas, and their existing is_active/district_id fields. Test before production.
 */

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGIN || "https://24adz.com,https://www.24adz.com")
    .split(",").map(value => value.trim()).filter(Boolean);
}

function safeOrigin(request, env) {
  const requestOrigin = request.headers.get("Origin");
  const allowed = allowedOrigins(env);
  // Requests without Origin (e.g. server-to-server tools) use the first configured origin.
  if (!requestOrigin) return allowed[0] || "https://24adz.com";
  return allowed.includes(requestOrigin) ? requestOrigin : "null";
}

function response(data, status = 200, origin = "null") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...JSON_HEADERS,
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "Content-Type,Authorization",
      "vary": "Origin"
    }
  });
}

function fail(message, status, origin) {
  return response({ ok: false, error: message }, status, origin);
}

function isAdmin(request, env) {
  const configured = env.ADMIN_API_TOKEN;
  const auth = request.headers.get("Authorization") || "";
  return typeof configured === "string" && configured.length >= 32 && auth === `Bearer ${configured}`;
}

function normalizeStatus(status) {
  const value = String(status || "pending").trim().toLowerCase();
  const statuses = {
    pending: "pending", active: "active", rejected: "rejected", expired: "expired"
  };
  return statuses[value] || null;
}

function adminShape(row) {
  const statusMap = {
    pending: "Pending", active: "Active", rejected: "Rejected", expired: "Expired",
    draft: "Pending", blocked: "Rejected", deleted: "Deleted"
  };
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    category: row.category,
    district: row.district,
    area: row.area || "",
    price: row.price_paise == null ? 0 : row.price_paise / 100,
    status: statusMap[row.status] || "Pending",
    expiry: row.expires_at ? String(row.expires_at).slice(0, 10) : "",
    vip: Boolean(row.is_vip || row.is_featured),
    name: row.contact_name || "",
    phone: row.contact_phone_e164 || "",
    whatsapp: row.whatsapp_enabled ? (row.contact_phone_e164 || "") : ""
  };
}

async function listAds(db, url, admin = false) {
  const params = [];
  let where = admin
    ? "1=1"
    : "a.status='active' AND (a.expires_at IS NULL OR a.expires_at >= datetime('now')) AND a.deleted_at IS NULL";

  const district = String(url.searchParams.get("district") || "").trim();
  const category = String(url.searchParams.get("category") || "").trim();
  const area = String(url.searchParams.get("area") || "").trim();
  const minPriceRaw = url.searchParams.get("minPrice");
  const maxPriceRaw = url.searchParams.get("maxPrice");

  if (district) { where += " AND lower(d.name)=lower(?)"; params.push(district); }
  if (category) { where += " AND lower(c.name)=lower(?)"; params.push(category); }
  if (area) { where += " AND lower(ar.name)=lower(?)"; params.push(area); }
  if (minPriceRaw !== null && minPriceRaw !== "") {
    const minPrice = Number(minPriceRaw);
    if (!Number.isFinite(minPrice) || minPrice < 0) throw new Error("INVALID_MIN_PRICE");
    where += " AND a.price_paise >= ?"; params.push(Math.round(minPrice * 100));
  }
  if (maxPriceRaw !== null && maxPriceRaw !== "") {
    const maxPrice = Number(maxPriceRaw);
    if (!Number.isFinite(maxPrice) || maxPrice < 0) throw new Error("INVALID_MAX_PRICE");
    where += " AND a.price_paise <= ?"; params.push(Math.round(maxPrice * 100));
  }

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
    item.createdAt = row.created_at ? (Date.parse(row.created_at) || null) : null;
    item.demo = false;
    return item;
  });
}

async function lookupId(db, table, name) {
  // Table names are internal constants, never user input.
  if (table !== "categories" && table !== "districts") return null;
  const row = await db.prepare(
    `SELECT id FROM ${table} WHERE lower(name)=lower(?) AND is_active=1 LIMIT 1`
  ).bind(name).first();
  return row?.id ?? null;
}

async function listReferenceData(db, table, districtName = "") {
  if (table === "categories" || table === "districts") {
    const result = await db.prepare(
      `SELECT id,name FROM ${table} WHERE is_active=1 ORDER BY name COLLATE NOCASE LIMIT 2000`
    ).all();
    return result.results || [];
  }
  if (table === "areas") {
    if (!districtName) return [];
    const districtId = await lookupId(db, "districts", districtName);
    if (!districtId) return [];
    const result = await db.prepare(
      "SELECT id,name FROM areas WHERE district_id=? AND is_active=1 ORDER BY name COLLATE NOCASE LIMIT 5000"
    ).bind(districtId).all();
    return result.results || [];
  }
  return [];
}

async function saveAd(request, env, id = null) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { error: "Invalid JSON body", status: 400 };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Request body must be a JSON object", status: 400 };
  }

  const title = String(body.title || "").trim().slice(0, 100);
  const category = String(body.category || "").trim().slice(0, 100);
  const district = String(body.district || "").trim().slice(0, 100);
  const area = String(body.area || "").trim().slice(0, 100);
  const description = String(body.description || "").trim().slice(0, 2000);
  if (!title || !category || !district || !area) {
    return { error: "title, category, district and area are required", status: 400 };
  }

  const categoryId = await lookupId(env.DB, "categories", category);
  const districtId = await lookupId(env.DB, "districts", district);
  if (!categoryId) return { error: "Unknown or inactive category", status: 400 };
  if (!districtId) return { error: "Unknown or inactive district", status: 400 };

  const areaRow = await env.DB.prepare(
    "SELECT id FROM areas WHERE district_id=? AND lower(name)=lower(?) AND is_active=1 LIMIT 1"
  ).bind(districtId, area).first();
  if (!areaRow) return { error: "Unknown or inactive area for the selected district", status: 400 };
  const areaId = areaRow.id;

  const price = body.price === "" || body.price == null ? null : Number(body.price);
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 100000000000)) {
    return { error: "Invalid price", status: 400 };
  }
  const status = normalizeStatus(body.status);
  if (!status) return { error: "status must be Pending, Active, Rejected or Expired", status: 400 };

  let expiry = null;
  if (body.expiry) {
    const expiryText = String(body.expiry).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryText) || Number.isNaN(Date.parse(`${expiryText}T00:00:00Z`))) {
      return { error: "Invalid expiry date; use YYYY-MM-DD", status: 400 };
    }
    expiry = `${expiryText}T23:59:59.000Z`;
  }

  const vip = body.vip === true || body.vip === "yes" || body.vip === 1 || body.vip === "1";
  const phone = String(body.phone || "").trim().slice(0, 20) || null;
  const name = String(body.name || "").trim().slice(0, 100) || null;
  const whatsappEnabled = Boolean(phone) && (
    body.whatsapp === true || body.whatsapp === "yes" || body.whatsapp === 1 || body.whatsapp === "1"
  );
  const now = new Date().toISOString();
  const pricePaise = price === null ? null : Math.round(price * 100);

  if (id) {
    const exists = await env.DB.prepare(
      "SELECT id FROM ads WHERE id=? AND deleted_at IS NULL"
    ).bind(id).first();
    if (!exists) return { error: "Listing not found", status: 404 };

    await env.DB.prepare(`
      UPDATE ads SET title=?,description=?,price_paise=?,category_id=?,district_id=?,area_id=?,
        status=?,is_vip=?,expires_at=?,contact_name=?,contact_phone_e164=?,whatsapp_enabled=?,updated_at=?
      WHERE id=? AND deleted_at IS NULL
    `).bind(
      title, description, pricePaise, categoryId, districtId, areaId, status,
      vip ? 1 : 0, expiry, name, phone, whatsappEnabled ? 1 : 0, now, id
    ).run();
    return { id, status: 200 };
  }

  const newId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO ads (
      id,title,description,price_paise,category_id,district_id,area_id,status,is_vip,
      expires_at,contact_name,contact_phone_e164,contact_phone_verified,whatsapp_enabled,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)
  `).bind(
    newId, title, description, pricePaise, categoryId, districtId, areaId, status,
    vip ? 1 : 0, expiry, name, phone, whatsappEnabled ? 1 : 0, now, now
  ).run();
  return { id: newId, status: 201 };
}

export default {
  async fetch(request, env) {
    const origin = safeOrigin(request, env);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
          "access-control-allow-headers": "Content-Type,Authorization",
          "vary": "Origin"
        }
      });
    }

    if (!url.pathname.startsWith("/api/")) return fail("Not found", 404, origin);

    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        return response({ ok: true, service: "24adz-api", database: Boolean(env.DB) }, 200, origin);
      }
      if (!env.DB) return fail("D1 binding DB is missing", 500, origin);

      if (url.pathname === "/api/ads" && request.method === "GET") {
        try {
          return response({ ok: true, ads: await listAds(env.DB, url, false) }, 200, origin);
        } catch (err) {
          if (String(err?.message || "").startsWith("INVALID_")) return fail("Invalid price filter", 400, origin);
          throw err;
        }
      }

      if (url.pathname === "/api/categories" && request.method === "GET") {
        return response({ ok: true, categories: await listReferenceData(env.DB, "categories") }, 200, origin);
      }
      if (url.pathname === "/api/districts" && request.method === "GET") {
        return response({ ok: true, districts: await listReferenceData(env.DB, "districts") }, 200, origin);
      }
      if (url.pathname === "/api/areas" && request.method === "GET") {
        const district = String(url.searchParams.get("district") || "").trim();
        return response({ ok: true, areas: await listReferenceData(env.DB, "areas", district) }, 200, origin);
      }

      if (url.pathname === "/api/admin/ads") {
        if (!isAdmin(request, env)) return fail("Unauthorized", 401, origin);
        if (request.method === "GET") {
          return response({ ok: true, ads: await listAds(env.DB, url, true) }, 200, origin);
        }
        if (request.method === "POST") {
          const result = await saveAd(request, env);
          return result.error
            ? fail(result.error, result.status, origin)
            : response({ ok: true, id: result.id }, result.status, origin);
        }
      }

      const match = url.pathname.match(/^\/api\/admin\/ads\/([A-Za-z0-9_-]+)$/);
      if (match) {
        if (!isAdmin(request, env)) return fail("Unauthorized", 401, origin);
        if (request.method === "PUT") {
          const result = await saveAd(request, env, match[1]);
          return result.error
            ? fail(result.error, result.status, origin)
            : response({ ok: true, id: result.id }, 200, origin);
        }
        if (request.method === "DELETE") {
          const now = new Date().toISOString();
          const result = await env.DB.prepare(
            "UPDATE ads SET status='deleted',deleted_at=?,updated_at=? WHERE id=? AND deleted_at IS NULL"
          ).bind(now, now, match[1]).run();
          if (!result.meta?.changes) return fail("Listing not found", 404, origin);
          return response({ ok: true }, 200, origin);
        }
      }

      return fail("Method or route not allowed", 405, origin);
    } catch (err) {
      // Avoid exposing SQL/schema details to public clients. Details remain in Worker logs.
      console.error("24adz-api error:", err?.stack || err?.message || err);
      return fail("Server error. Check Worker logs and D1 schema.", 500, origin);
    }
  }
};
