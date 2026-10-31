def _line_total(item):
    if item["qty"] <= 0:
        return 0
    price = item["price"] * item["qty"]
    if item["price"] > 100:
        return price * _discount_rate(item)
    if item["price"] > 50:
        return price
    return price * 1.1


def _discount_rate(item):
    if item.get("vip"):
        return 0.85
    if item.get("bulk"):
        return 0.88
    return 0.9


def _apply_coupon(total, order):
    coupon = order.get("coupon")
    if coupon == "SAVE20":
        return total * 0.8
    if coupon and coupon.startswith("HALF"):
        return total * 0.5
    if coupon:
        return total * 0.95
    return total


def process_order(order):
    total = sum(_line_total(i) for i in order["items"])
    total = _apply_coupon(total, order)
    if order.get("rush") and order["items"]:
        total += 25
    return total
