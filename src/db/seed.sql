insert into businesses (
  id, name, slug, whatsapp_number, welcome_message, payment_methods, status
)
values (
  '11111111-1111-1111-1111-111111111111',
  'I Love Fresas',
  'i-love-fresas',
  '573001112233',
  'Hola, soy el asistente de I Love Fresas. Te ayudo con el menu y tu pedido a domicilio.',
  '["Nequi","Bancolombia","Contra entrega"]'::jsonb,
  '{"manualOpenOverride":null,"deliveryEnabled":true,"acceptingOrders":true}'::jsonb
)
on conflict (id) do nothing;

insert into business_hours (id, business_id, day_of_week, opens_at, closes_at)
values
  ('20000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1, '14:00', '22:00'),
  ('20000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 2, '14:00', '22:00'),
  ('20000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 3, '14:00', '22:00'),
  ('20000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 4, '14:00', '22:00'),
  ('20000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 5, '14:00', '23:59'),
  ('20000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 6, '14:00', '23:59'),
  ('20000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 0, '14:00', '23:59')
on conflict (id) do nothing;

insert into delivery_zones (id, business_id, name, aliases, fee, is_active)
values
  ('30000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'La Paz', '["la paz","barrio la paz"]'::jsonb, 0, true)
on conflict (id) do nothing;

insert into modifier_groups (id, business_id, name, selection_mode, min_selections, max_selections)
values
  ('40000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Toppings', 'multiple', 0, 6)
on conflict (id) do nothing;

insert into modifier_options (id, business_id, modifier_group_id, name, aliases, price_delta, is_active)
values
  ('50000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '40000000-0000-0000-0000-000000000001', 'Nutella', '["nutella"]'::jsonb, 4000, true),
  ('50000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '40000000-0000-0000-0000-000000000001', 'Brownie', '["brownie"]'::jsonb, 2000, true),
  ('50000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '40000000-0000-0000-0000-000000000001', 'Oreo', '["oreo"]'::jsonb, 2000, true),
  ('50000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '40000000-0000-0000-0000-000000000001', 'Helado', '["helado"]'::jsonb, 4000, true),
  ('50000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', '40000000-0000-0000-0000-000000000001', 'Milo', '["milo"]'::jsonb, 2000, true)
on conflict (id) do nothing;

insert into products (
  id, business_id, name, aliases, category, description, base_price, is_active, is_out_of_stock, default_components, removable_components, allows_free_text_customizations
)
values
  ('60000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Fresas con crema tradicional', '["tradicional","fresa tradicional","fresas tradicionales","fresas con crema","fresas con krema","fresas cn crema","fresas cn krema"]'::jsonb, 'fresas-con-crema', 'Base clasica de fresa con crema.', 16000, true, false, '["fresa","crema"]'::jsonb, '["crema"]'::jsonb, true),
  ('60000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Fresas con helado', '["fresas con helado","fresa con helado","una de fresa con helado","con helado"]'::jsonb, 'fresas-con-crema', 'Fresas con helado y crema.', 18000, true, false, '["fresa","crema","helado"]'::jsonb, '["crema","helado"]'::jsonb, true),
  ('60000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Oblea Nutella', '["oblea","oblea con nutella"]'::jsonb, 'obleas', 'Oblea con nutella.', 8000, true, false, '["oblea","nutella"]'::jsonb, '["nutella"]'::jsonb, true),
  ('60000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Waffle Tradicional', '["waffle tradicional","waffle"]'::jsonb, 'antojitos', 'Escoge una fruta, crema, 1 sabor de helado y 1 salsa.', 15000, true, false, '["fruta","crema","helado","salsa"]'::jsonb, '["crema","helado","salsa"]'::jsonb, true),
  ('60000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Malteada Fresa', '["malteada","malteada fresa"]'::jsonb, 'malteadas', 'Malteada de fresa.', 15000, true, false, '["fresa"]'::jsonb, '[]'::jsonb, true)
on conflict (id) do nothing;

insert into product_modifier_groups (product_id, modifier_group_id)
values
  ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001')
on conflict do nothing;
