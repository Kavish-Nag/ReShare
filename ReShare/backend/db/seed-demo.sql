-- LOCAL/PRESENTATION DEMO DATA ONLY. Do not apply these demo accounts to a public production database.
-- Passwords are scrypt hashes. Demo credentials are documented in README.md.
INSERT INTO users (id,cognito_sub,name,email,password_hash,role,status,service_area,availability_status)
VALUES
 ('11111111-1111-4111-8111-111111111111','local-demo-buyer','Aarav Mehta','buyer@reshare.demo','scrypt$62757965722d726573686172652d73616c74$6040f839b587e1f7bddcb3f53075a9b0aa442f93be924508ce1c875b698386132f25cc0648e4d5e536a35a07429ce43baea66b2c2544931274211c124e67e274','buyer','ACTIVE','Pune','UNAVAILABLE'),
 ('22222222-2222-4222-8222-222222222222','local-demo-seller','Green Basket Store','seller@reshare.demo','scrypt$73656c6c65722d726573686172652d73616c74$15ea1cb40878fe8744ff9f9ba52d231eb1a3a09cc39254b0ab973b9f59aee6037cce1e26e46fe81c4196e61ebafdb5d947f0da5875ccf0cbd0bf23e2919b90ec','seller','ACTIVE','Pune','UNAVAILABLE'),
 ('33333333-3333-4333-8333-333333333333','local-demo-delivery','Demo Delivery Partner','delivery@reshare.demo','scrypt$64656c69766572792d726573686172652d73616c74$62f0d81af3d9afe5407242fe2c5f46f67d25f59cf468b46be8a7cb36d2b1084e30afd4c5da0b52c767384bf6517be7974939811cf6e0a7a59e6c246fbedc50c5','delivery','ACTIVE','Pune','AVAILABLE'),
 ('44444444-4444-4444-8444-444444444444','local-demo-admin','ReShare Administrator','admin@reshare.demo','scrypt$61646d696e2d726573686172652d73616c74$0f068ae7c4e024c87d217748744b2cd6045a157af208d6c80bf77c416ad87f78c78aa9899c6e02ec91e999631a20a01c9541c8a14beb05d18d175661f8b514a8','admin','ACTIVE','Pune','UNAVAILABLE')
ON CONFLICT (id) DO UPDATE SET
 name=EXCLUDED.name,email=EXCLUDED.email,password_hash=EXCLUDED.password_hash,role=EXCLUDED.role,
 status=EXCLUDED.status,service_area=EXCLUDED.service_area,availability_status=EXCLUDED.availability_status;

INSERT INTO listings (id,seller_id,title,description,category,image_url,price_cents,original_price_cents,quantity_available,quantity_unit,expiry_at,prepared_at,storage_conditions,allergens,pickup_address,pickup_area,status)
VALUES
 ('10000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','Fresh Produce Saver Box','A mixed box of seasonal vegetables, ideal for today’s cooking.','Produce','https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=900&q=80',9900,18000,8,'box',NOW()+INTERVAL '2 days',NOW()-INTERVAL '3 hours','Keep refrigerated','{}','Green Basket Store, Lane 3, Viman Nagar','Viman Nagar','AVAILABLE'),
 ('10000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','Bakery Rescue Bundle','Fresh bread and buns from today’s bakery batch.','Bakery','https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80',6500,12000,5,'packet',NOW()+INTERVAL '1 day',NOW()-INTERVAL '5 hours','Store cool and dry','{gluten}','Green Basket Store, Lane 3, Viman Nagar','Viman Nagar','AVAILABLE'),
 ('10000000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222','Banana Family Pack','Ripe bananas, great for smoothies or breakfast.','Produce','https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=900&q=80',3500,6000,12,'bunch',NOW()+INTERVAL '3 days',NULL,'Keep at room temperature','{}','Green Basket Store, Lane 3, Viman Nagar','Viman Nagar','AVAILABLE'),
 ('10000000-0000-4000-8000-000000000004','22222222-2222-4222-8222-222222222222','Garden Salad Bowl','Ready-to-eat vegetable salad. Check allergens before consuming.','Meals','https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80',7900,14000,4,'portion',NOW()+INTERVAL '10 hours',NOW()-INTERVAL '2 hours','Keep refrigerated','{}','Green Basket Store, Lane 3, Viman Nagar','Viman Nagar','AVAILABLE'),
 ('10000000-0000-4000-8000-000000000005','22222222-2222-4222-8222-222222222222','Pasta Lunch Box','Surplus pasta portion prepared today.','Meals','https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=900&q=80',8500,16000,3,'portion',NOW()+INTERVAL '8 hours',NOW()-INTERVAL '3 hours','Keep refrigerated','{gluten}','Green Basket Store, Lane 3, Viman Nagar','Kalyani Nagar','AVAILABLE'),
 ('10000000-0000-4000-8000-000000000006','22222222-2222-4222-8222-222222222222','Yogurt Snack Cups','Chilled snack cups nearing their best-before date.','Dairy','https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=900&q=80',2500,4500,10,'cup',NOW()+INTERVAL '4 days',NULL,'Keep refrigerated','{milk}','Green Basket Store, Lane 3, Viman Nagar','Koregaon Park','AVAILABLE')
ON CONFLICT (id) DO UPDATE SET
 title=EXCLUDED.title,description=EXCLUDED.description,category=EXCLUDED.category,image_url=EXCLUDED.image_url,
 price_cents=EXCLUDED.price_cents,original_price_cents=EXCLUDED.original_price_cents,
 quantity_available=EXCLUDED.quantity_available,quantity_unit=EXCLUDED.quantity_unit,expiry_at=EXCLUDED.expiry_at,
 prepared_at=EXCLUDED.prepared_at,storage_conditions=EXCLUDED.storage_conditions,allergens=EXCLUDED.allergens,
 pickup_address=EXCLUDED.pickup_address,pickup_area=EXCLUDED.pickup_area,status=EXCLUDED.status;

INSERT INTO orders (id,buyer_id,total_cents,payment_status,order_status,idempotency_key,created_at)
VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',9900,'DEMO_PENDING','DELIVERED','seed-order-delivered',NOW()-INTERVAL '3 days'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111',6500,'DEMO_PENDING','ASSIGNED','seed-order-assigned',NOW()-INTERVAL '5 hours')
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_items (id,order_id,listing_id,seller_id,title_snapshot,quantity,unit_price_cents)
VALUES
 ('c1000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','Fresh Produce Saver Box',1,9900),
 ('c1000000-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','10000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','Bakery Rescue Bundle',1,6500)
ON CONFLICT (id) DO NOTHING;

INSERT INTO deliveries (id,order_id,partner_id,pickup_address,pickup_area,delivery_address,delivery_status,assigned_at,updated_at)
VALUES
 ('d1000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','Green Basket Store, Lane 3, Viman Nagar','Viman Nagar','Flat 6, Maple Residency, Pune','DELIVERED',NOW()-INTERVAL '3 days',NOW()-INTERVAL '3 days'),
 ('d1000000-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','Green Basket Store, Lane 3, Viman Nagar','Viman Nagar','A-204, Sky Apartments, Pune','ASSIGNED',NOW()-INTERVAL '5 hours',NOW()-INTERVAL '5 hours')
ON CONFLICT (order_id) DO UPDATE SET
 partner_id=EXCLUDED.partner_id,delivery_status=EXCLUDED.delivery_status,assigned_at=EXCLUDED.assigned_at,
 pickup_address=EXCLUDED.pickup_address,pickup_area=EXCLUDED.pickup_area,delivery_address=EXCLUDED.delivery_address,
 updated_at=EXCLUDED.updated_at;
