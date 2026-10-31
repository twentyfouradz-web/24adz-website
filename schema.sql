PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
  phone_verified INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','blocked')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS otp_codes (
  phone TEXT PRIMARY KEY,
  otp_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL DEFAULT '📦',
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subcategories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(category_id, slug)
);

CREATE TABLE IF NOT EXISTS districts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district_id INTEGER NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(district_id, name)
);

CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  subcategory_id INTEGER REFERENCES subcategories(id),
  district_id INTEGER NOT NULL REFERENCES districts(id),
  area_id INTEGER REFERENCES areas(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  price_type TEXT NOT NULL DEFAULT 'fixed',
  image_key TEXT,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  whatsapp_enabled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','blocked')),
  is_vip INTEGER NOT NULL DEFAULT 0,
  vip_until TEXT,
  rejection_reason TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ads_public ON ads(status, is_vip, created_at);
CREATE INDEX IF NOT EXISTS idx_ads_user_date ON ads(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ads_category ON ads(category_id, status);
CREATE INDEX IF NOT EXISTS idx_ads_district ON ads(district_id, status);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  ad_id TEXT NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  buyer_id TEXT NOT NULL REFERENCES users(id),
  seller_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(ad_id, buyer_id, seller_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);

CREATE TABLE IF NOT EXISTS ad_reports (
  id TEXT PRIMARY KEY,
  ad_id TEXT NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  reporter_id TEXT REFERENCES users(id),
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO settings(key,value) VALUES
 ('free_ads_per_day','2'),
 ('free_ad_expiry_days','30'),
 ('vip_3_day_price','300'),
 ('vip_7_day_price','500'),
 ('max_image_bytes','5242880');

INSERT OR IGNORE INTO categories(name,slug,icon,sort_order) VALUES
 ('Cars','cars','🚗',1),
 ('Bikes','bikes','🏍️',2),
 ('House','house','🏠',3),
 ('Mobiles','mobiles','📱',4),
 ('Jobs','jobs','💼',5),
 ('House Movers','house-movers','🚚',6);

INSERT OR IGNORE INTO districts(name) VALUES
 ('Ariyalur'),('Chengalpattu'),('Chennai'),('Coimbatore'),('Cuddalore'),
 ('Dharmapuri'),('Dindigul'),('Erode'),('Kallakurichi'),('Kancheepuram'),
 ('Kanniyakumari'),('Karur'),('Krishnagiri'),('Madurai'),('Mayiladuthurai'),
 ('Nagapattinam'),('Namakkal'),('Perambalur'),('Pudukkottai'),('Ramanathapuram'),
 ('Ranipet'),('Salem'),('Sivaganga'),('Tenkasi'),('Thanjavur'),
 ('Theni'),('Thoothukudi'),('Tiruchirappalli'),('Tirunelveli'),('Tirupathur'),
 ('Tiruppur'),('Tiruvallur'),('Tiruvannamalai'),('Tiruvarur'),('Vellore'),
 ('Viluppuram'),('Virudhunagar'),('The Nilgiris');
