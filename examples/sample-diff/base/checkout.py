def process_order(order):
    total = 0
    for item in order["items"]:
        if item["qty"] > 0:
            if item["price"] > 100:
                total += item["price"] * item["qty"] * 0.9
            else:
                total += item["price"] * item["qty"]
        else:
            total += 0
    if order.get("coupon"):
        total = total * 0.95
    return total
