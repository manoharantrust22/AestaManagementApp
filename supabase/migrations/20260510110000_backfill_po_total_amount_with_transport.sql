UPDATE purchase_orders
SET total_amount = total_amount + transport_cost
WHERE transport_cost > 0;
