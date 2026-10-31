def process_order(order):
    total = 0
    for item in order["items"]:
        if item["qty"] > 0:
            if item["price"] > 100:
                if item.get("vip"):
                    total += item["price"] * item["qty"] * 0.85
                elif item.get("bulk"):
                    total += item["price"] * item["qty"] * 0.88
                else:
                    total += item["price"] * item["qty"] * 0.9
            elif item["price"] > 50:
                total += item["price"] * item["qty"]
            else:
                total += item["price"] * item["qty"] * 1.1
        elif item["qty"] == 0:
            total += 0
        else:
            raise ValueError("bad qty")
    if order.get("coupon"):
        if order["coupon"] == "SAVE20":
            total = total * 0.8
        elif order["coupon"].startswith("HALF"):
            total = total * 0.5
        else:
            total = total * 0.95
    if order.get("rush") and order["items"]:
        total += 25
    return total
