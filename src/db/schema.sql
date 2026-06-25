-- Multi-business restaurant ordering schema for the chatbot platform MVP.

create table if not exists businesses (
  id uuid primary key,
  name text not null,
  slug text not null unique,
  whatsapp_number text not null unique,
  welcome_message text not null,
  payment_methods jsonb not null default '[]'::jsonb,
  status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists business_hours (
  id uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists special_closures (
  id uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  date date not null,
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists delivery_zones (
  id uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  aliases jsonb not null default '[]'::jsonb,
  fee integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  aliases jsonb not null default '[]'::jsonb,
  category text not null,
  description text not null default '',
  base_price integer not null,
  is_active boolean not null default true,
  is_out_of_stock boolean not null default false,
  default_components jsonb not null default '[]'::jsonb,
  removable_components jsonb not null default '[]'::jsonb,
  allows_free_text_customizations boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists modifier_groups (
  id uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  selection_mode text not null check (selection_mode in ('single', 'multiple')),
  min_selections integer not null default 0,
  max_selections integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists modifier_options (
  id uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  modifier_group_id uuid not null references modifier_groups(id) on delete cascade,
  name text not null,
  aliases jsonb not null default '[]'::jsonb,
  price_delta integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists product_modifier_groups (
  product_id uuid not null references products(id) on delete cascade,
  modifier_group_id uuid not null references modifier_groups(id) on delete cascade,
  primary key (product_id, modifier_group_id)
);

create table if not exists promotions (
  id uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  type text not null check (type in ('fixed_price', 'combo', 'percent_discount', 'flat_discount', 'free_addon', 'buy_x_get_y')),
  is_active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  phone text not null,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, phone)
);

create table if not exists conversations (
  id uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  customer_phone text not null,
  state text not null,
  draft_order jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  customer_phone text not null,
  role text not null check (role in ('customer', 'bot', 'operator')),
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  customer_phone text not null,
  fulfillment_type text not null default 'delivery' check (fulfillment_type in ('delivery', 'pickup')),
  customer_name text,
  address text,
  zone_name text,
  payment_method text,
  cash_amount text,
  notes text,
  status text not null check (status in ('pending_review', 'confirmed', 'preparing', 'dispatched', 'completed', 'cancelled')),
  pricing jsonb not null,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key,
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  quantity integer not null default 1,
  unit_base_price integer not null,
  notes text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists order_item_components (
  id uuid primary key,
  order_item_id uuid not null references order_items(id) on delete cascade,
  name text not null,
  type text not null check (type in ('default', 'removed', 'added', 'replaced')),
  price_delta integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists accounting_dispatched_orders (
  order_id text primary key,
  business_id text not null,
  customer_phone text not null,
  customer_name text,
  fulfillment_type text not null,
  address text,
  neighborhood text,
  address_reference text,
  payment_method text,
  cash_amount text,
  subtotal integer not null default 0,
  delivery_fee integer not null default 0,
  discount_total integer not null default 0,
  total integer not null default 0,
  status text not null,
  dispatched_at timestamptz not null,
  order_created_at timestamptz not null,
  order_updated_at timestamptz not null,
  order_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_users (
  id uuid primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null check (role in ('admin', 'operator')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, email)
);

create index if not exists idx_products_business_id on products (business_id);
create index if not exists idx_delivery_zones_business_id on delivery_zones (business_id);
create index if not exists idx_customers_business_phone on customers (business_id, phone);
create index if not exists idx_conversations_business_phone on conversations (business_id, customer_phone);
create index if not exists idx_messages_conversation_id on messages (conversation_id);
create index if not exists idx_orders_business_status on orders (business_id, status);
create index if not exists idx_accounting_dispatched_orders_business_date on accounting_dispatched_orders (business_id, dispatched_at desc);
create index if not exists idx_accounting_dispatched_orders_customer_phone on accounting_dispatched_orders (customer_phone);
