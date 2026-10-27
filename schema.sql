-- 24adz.com Cloudflare D1 schema
-- SQLite / Cloudflare D1 compatible.
-- Apply to a NEW/empty database. If tables already exist, back up and migrate carefully.

PRAGMA foreign_keys = ON;

-- Users who can own listings. Do not store OTP codes or plaintext passwords here.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  phone_e164 TEXT UNIQUE,
  phone_verified_at TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','blocked','deleted')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Admin accounts. Store only a strong password hash, never a plaintext password.
-- Prefer Cloudflare Access / a trusted auth provider for production authentication.
CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'admin'
    CHECK (role IN ('owner','admin','moderator')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','disabled')),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS districts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);


-- Seed Tamil Nadu's 38 districts. Safe to run repeatedly.
INSERT OR IGNORE INTO districts (name, slug, sort_order) VALUES
  ('Ariyalur', 'ariyalur', 1),
  ('Chengalpattu', 'chengalpattu', 2),
  ('Chennai', 'chennai', 3),
  ('Coimbatore', 'coimbatore', 4),
  ('Cuddalore', 'cuddalore', 5),
  ('Dharmapuri', 'dharmapuri', 6),
  ('Dindigul', 'dindigul', 7),
  ('Erode', 'erode', 8),
  ('Kallakurichi', 'kallakurichi', 9),
  ('Kancheepuram', 'kancheepuram', 10),
  ('Kanniyakumari', 'kanniyakumari', 11),
  ('Karur', 'karur', 12),
  ('Krishnagiri', 'krishnagiri', 13),
  ('Madurai', 'madurai', 14),
  ('Mayiladuthurai', 'mayiladuthurai', 15),
  ('Nagapattinam', 'nagapattinam', 16),
  ('Namakkal', 'namakkal', 17),
  ('The Nilgiris', 'the-nilgiris', 18),
  ('Perambalur', 'perambalur', 19),
  ('Pudukkottai', 'pudukkottai', 20),
  ('Ramanathapuram', 'ramanathapuram', 21),
  ('Ranipet', 'ranipet', 22),
  ('Salem', 'salem', 23),
  ('Sivaganga', 'sivaganga', 24),
  ('Tenkasi', 'tenkasi', 25),
  ('Thanjavur', 'thanjavur', 26),
  ('Theni', 'theni', 27),
  ('Thoothukudi', 'thoothukudi', 28),
  ('Tiruchirappalli', 'tiruchirappalli', 29),
  ('Tirunelveli', 'tirunelveli', 30),
  ('Tirupathur', 'tirupathur', 31),
  ('Tiruppur', 'tiruppur', 32),
  ('Tiruvallur', 'tiruvallur', 33),
  ('Tiruvannamalai', 'tiruvannamalai', 34),
  ('Tiruvarur', 'tiruvarur', 35),
  ('Vellore', 'vellore', 36),
  ('Viluppuram', 'viluppuram', 37),
  ('Virudhunagar', 'virudhunagar', 38);

CREATE TABLE IF NOT EXISTS areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE RESTRICT,
  UNIQUE (district_id, name),
  UNIQUE (district_id, slug)
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  category_id INTEGER NOT NULL,
  district_id INTEGER NOT NULL,
  area_id INTEGER,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_paise INTEGER CHECK (price_paise IS NULL OR price_paise >= 0),
  price_type TEXT NOT NULL DEFAULT 'fixed'
    CHECK (price_type IN ('fixed','negotiable','free','contact')),
  condition_label TEXT,
  contact_name TEXT,
  contact_phone_e164 TEXT,
  contact_phone_verified INTEGER NOT NULL DEFAULT 0 CHECK (contact_phone_verified IN (0,1)),
  whatsapp_enabled INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_enabled IN (0,1)),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('draft','pending','active','rejected','expired','deleted','blocked')),
  rejection_reason TEXT,
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0,1)),
  is_vip INTEGER NOT NULL DEFAULT 0 CHECK (is_vip IN (0,1)),
  starts_at TEXT,
  expires_at TEXT,
  approved_by_admin_id TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE RESTRICT,
  FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ad_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  r2_object_key TEXT,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (ad_id) REFERENCES ads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  ad_id TEXT,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_order_id TEXT UNIQUE,
  provider_payment_id TEXT UNIQUE,
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  purpose TEXT NOT NULL DEFAULT 'vip'
    CHECK (purpose IN ('vip','featured','renewal','other')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','authorized','captured','failed','refunded','cancelled')),
  verified_at TEXT,
  provider_payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (ad_id) REFERENCES ads(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  ad_id TEXT,
  reporter_user_id TEXT,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','reviewing','resolved','dismissed')),
  handled_by_admin_id TEXT,
  handled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (ad_id) REFERENCES ads(id) ON DELETE SET NULL,
  FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (handled_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  ad_id TEXT,
  buyer_user_id TEXT,
  seller_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','blocked')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (ad_id) REFERENCES ads(id) ON DELETE SET NULL,
  FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (seller_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  sender_user_id TEXT,
  message_text TEXT NOT NULL,
  attachment_url TEXT,
  is_reported INTEGER NOT NULL DEFAULT 0 CHECK (is_reported IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_by_admin_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (updated_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details_json TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS otp_verification_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  phone_e164 TEXT NOT NULL,
  provider_reference TEXT,
  status TEXT NOT NULL CHECK (status IN ('requested','verified','failed','expired')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for fast search, category/district/area filtering, admin dashboards and expiry checks.
CREATE INDEX IF NOT EXISTS idx_ads_status_created ON ads(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ads_category_status ON ads(category_id, status);
CREATE INDEX IF NOT EXISTS idx_ads_district_status ON ads(district_id, status);
CREATE INDEX IF NOT EXISTS idx_ads_area_status ON ads(area_id, status);
CREATE INDEX IF NOT EXISTS idx_ads_expiry ON ads(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_ads_featured ON ads(is_featured, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ads_vip ON ads(is_vip, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ads_user ON ads(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_images_ad ON ad_images(ad_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_areas_district ON areas(district_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_payments_status_created ON payments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_ad ON payments(ad_id);
CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_users ON chats(buyer_user_id, seller_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at DESC);

-- Seed the six primary 24adz categories. Safe to run repeatedly.
INSERT OR IGNORE INTO categories (name, slug, description, icon, sort_order) VALUES
  ('Cars', 'cars', 'Cars for sale', '🚗', 1),
  ('Bikes', 'bikes', 'Bikes for sale', '🏍️', 2),
  ('House', 'house', 'Houses for rent and sale', '🏠', 3),
  ('Mobiles', 'mobiles', 'Phones and devices', '📱', 4),
  ('Jobs', 'jobs', 'Jobs and careers', '💼', 5),
  ('House Movers', 'house-movers', 'Moving services', '🚚', 6);

-- Default public site settings. Change these through a protected admin API.
INSERT OR IGNORE INTO site_settings (setting_key, setting_value) VALUES
  ('site_name', '24adz.com'),
  ('tagline', 'Tamil Nadu Buy & Sell'),
  ('default_ad_duration_days', '30'),
  ('moderation_required', 'true');
