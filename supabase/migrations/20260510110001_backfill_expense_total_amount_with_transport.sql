UPDATE material_purchase_expenses
SET total_amount = total_amount + transport_cost
WHERE transport_cost > 0;
