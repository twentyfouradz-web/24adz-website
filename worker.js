/**
 * ==========================================
 * 24Adz.com - Cloudflare Worker API
 * PART 1: INITIAL SETUP
 * ==========================================
 *
 * D1 Database Binding: DB
 * Secret: ADMIN_API_TOKEN
 */

export default {
  async fetch(request, env, ctx) {

    const url = new URL(request.url);

    const path = url.pathname.replace(/\/+$/, "") || "/";

    const method = request.method;

    // ======================================
    // CORS HEADERS
    // ======================================

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",

      "Access-Control-Allow-Methods":
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",

      "Access-Control-Allow-Headers":
        "Content-Type, Authorization",

      "Content-Type":
        "application/json; charset=UTF-8",

      "X-Content-Type-Options":
        "nosniff"
    };

    // ======================================
    // JSON RESPONSE FUNCTION
    // ======================================

    function json(data, status = 200) {

      return new Response(
        JSON.stringify(data),
        {
          status: status,
          headers: corsHeaders
        }
      );

    }

    // ======================================
    // HANDLE PREFLIGHT REQUEST
    // ======================================

    if (method === "OPTIONS") {

      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });

    }

    // ======================================
    // NEXT PARTS WILL BE ADDED HERE
    // ======================================

    try {

      // PART 2: HEALTH CHECK
      // PART 3: ADMIN AUTHENTICATION
      // PART 4: GET ADVERTISEMENTS
      // PART 5: GET SINGLE AD
      // PART 6: CREATE AD
      // PART 7: UPDATE AND DELETE ADS
      // PART 8: ERROR HANDLING AND CLOSING

    } catch (error) {

      console.error("24Adz API Error:", error);

      return json({
        success: false,
        message: "Internal server error"
      }, 500);

    }

  }
};      if (path === "/api/health" && method === "GET") {
        return json({
          success: true,
          website: "24Adz.com",
          message: "API is running",
          database: "D1"
        });
      }

      if (path === "/api" && method === "GET") {
        return json({
          success: true,
          website: "24Adz.com",
          message: "Welcome to 24Adz API"
        });
      }      async function verifyAdmin() {
        const authHeader = request.headers.get("Authorization");

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return false;
        }

        const token = authHeader.slice(7);

        if (!env.ADMIN_API_TOKEN || !token) {
          return false;
        }

        const encoder = new TextEncoder();
        const tokenBytes = encoder.encode(token);
        const secretBytes = encoder.encode(env.ADMIN_API_TOKEN);

        if (tokenBytes.length !== secretBytes.length) {
          return false;
        }

        let difference = 0;

        for (let i = 0; i < tokenBytes.length; i++) {
          difference |= tokenBytes[i] ^ secretBytes[i];
        }

        return difference === 0;
      }

      async function requireAdmin() {
        const authenticated = await verifyAdmin();

        if (!authenticated) {
          return json({
            success: false,
            message: "Admin authentication required"
          }, 401);
        }

        return null;
      }

      if (path === "/api/admin/verify" && method === "GET") {
        const authError = await requireAdmin();

        if (authError) {
          return authError;
        }

        return json({
          success: true,
          message: "Admin authentication successful"
        });
      }      if (path === "/api/ads" && method === "GET") {
        const category = url.searchParams.get("category");
        const district = url.searchParams.get("district");
        const area = url.searchParams.get("area");
        const search = url.searchParams.get("search");

        const page = Math.max(
          1,
          parseInt(url.searchParams.get("page") || "1", 10)
        );

        const limit = Math.min(
          100,
          Math.max(
            1,
            parseInt(url.searchParams.get("limit") || "50", 10)
          )
        );

        const offset = (page - 1) * limit;

        let sql = "SELECT * FROM ads WHERE 1 = 1";
        const params = [];

        if (category) {
          sql += " AND category = ?";
          params.push(category);
        }

        if (district) {
          sql += " AND district = ?";
          params.push(district);
        }

        if (area) {
          sql += " AND area = ?";
          params.push(area);
        }

        if (search) {
          sql += " AND (title LIKE ? OR description LIKE ?)";
          params.push("%" + search + "%", "%" + search + "%");
        }

        sql += " ORDER BY id DESC LIMIT ? OFFSET ?";
        params.push(limit, offset);

        const result = await env.DB
          .prepare(sql)
          .bind(...params)
          .all();

        return json({
          success: true,
          page: page,
          limit: limit,
          count: result.results.length,
          ads: result.results
        });
      }      const singleAdMatch = path.match(
        /^\/api\/ads\/(\d+)$/
      );

      if (singleAdMatch && method === "GET") {
        const id = Number(singleAdMatch[1]);

        const ad = await env.DB
          .prepare("SELECT * FROM ads WHERE id = ?")
          .bind(id)
          .first();

        if (!ad) {
          return json({
            success: false,
            message: "Advertisement not found"
          }, 404);
        }

        return json({
          success: true,
          ad: ad
        });
      }      if (path === "/api/ads" && method === "POST") {
        const authError = await requireAdmin();

        if (authError) {
          return authError;
        }

        let body;

        try {
          body = await request.json();
        } catch {
          return json({
            success: false,
            message: "Invalid JSON request body"
          }, 400);
        }

        if (
          !body ||
          typeof body.title !== "string" ||
          typeof body.category !== "string" ||
          typeof body.district !== "string"
        ) {
          return json({
            success: false,
            message: "Title, category and district are required"
          }, 400);
        }

        const title = body.title.trim();
        const category = body.category.trim();
        const district = body.district.trim();

        const area =
          typeof body.area === "string"
            ? body.area.trim()
            : "";

        const description =
          typeof body.description === "string"
            ? body.description.trim()
            : "";

        if (!title || !category || !district) {
          return json({
            success: false,
            message: "Title, category and district cannot be empty"
          }, 400);
        }

        if (
          title.length > 200 ||
          category.length > 100 ||
          district.length > 100 ||
          area.length > 150 ||
          description.length > 10000
        ) {
          return json({
            success: false,
            message: "One or more fields exceed the allowed length"
          }, 400);
        }

        const result = await env.DB
          .prepare(`
            INSERT INTO ads (
              title,
              category,
              district,
              area,
              description
            )
            VALUES (?, ?, ?, ?, ?)
          `)
          .bind(
            title,
            category,
            district,
            area,
            description
          )
          .run();

        return json({
          success: true,
          message: "Advertisement created successfully",
          id: result.meta.last_row_id
        }, 201);
      }      if (
        singleAdMatch &&
        (method === "PUT" || method === "PATCH")
      ) {
        const authError = await requireAdmin();

        if (authError) {
          return authError;
        }

        const id = Number(singleAdMatch[1]);

        let body;

        try {
          body = await request.json();
        } catch {
          return json({
            success: false,
            message: "Invalid JSON request body"
          }, 400);
        }

        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return json({
            success: false,
            message: "Invalid request data"
          }, 400);
        }

        const existing = await env.DB
          .prepare("SELECT id FROM ads WHERE id = ?")
          .bind(id)
          .first();

        if (!existing) {
          return json({
            success: false,
            message: "Advertisement not found"
          }, 404);
        }

        const allowedFields = [
          "title",
          "category",
          "district",
          "area",
          "description"
        ];

        const maxLengths = {
          title: 200,
          category: 100,
          district: 100,
          area: 150,
          description: 10000
        };

        const updates = [];
        const values = [];

        for (const field of allowedFields) {
          if (
            Object.prototype.hasOwnProperty.call(body, field)
          ) {
            if (typeof body[field] !== "string") {
              return json({
                success: false,
                message: "Invalid value for " + field
              }, 400);
            }

            const value = body[field].trim();

            if (value.length > maxLengths[field]) {
              return json({
                success: false,
                message: field + " exceeds the allowed length"
              }, 400);
            }

            updates.push(field + " = ?");
            values.push(value);
          }
        }

        if (updates.length === 0) {
          return json({
            success: false,
            message: "No valid fields provided"
          }, 400);
        }

        values.push(id);

        await env.DB
          .prepare(
            "UPDATE ads SET " +
            updates.join(", ") +
            " WHERE id = ?"
          )
          .bind(...values)
          .run();

        return json({
          success: true,
          message: "Advertisement updated successfully",
          id: id
        });
      }      if (singleAdMatch && method === "DELETE") {
        const authError = await requireAdmin();

        if (authError) {
          return authError;
        }

        const id = Number(singleAdMatch[1]);

        const existing = await env.DB
          .prepare("SELECT id FROM ads WHERE id = ?")
          .bind(id)
          .first();

        if (!existing) {
          return json({
            success: false,
            message: "Advertisement not found"
          }, 404);
        }

        await env.DB
          .prepare("DELETE FROM ads WHERE id = ?")
          .bind(id)
          .run();

        return json({
          success: true,
          message: "Advertisement deleted successfully",
          id: id
        });
      }

      return json({
        success: false,
        message: "API endpoint not found"
      }, 404);    } catch (error) {
      console.error("24Adz API Error:", error);

      return json({
        success: false,
        message: "Internal server error"
      }, 500);
    }
  }
};
