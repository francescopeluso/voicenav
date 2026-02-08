import logging
from config import settings

logger = logging.getLogger(__name__)

MOCK_PAGE_CONTENT = {
    "default": """
Welcome to ExampleStore - Your Trusted Online Retailer

Products | Deals | Support | About Us

Featured Product: MechaType Pro 75% Mechanical Keyboard
Price: $89.99
Color: Space Gray | White | Navy Blue
Switches: Cherry MX Brown / Red / Blue
Features: Hot-swappable, RGB, USB-C, Wireless Bluetooth 5.0
Rating: 4.7/5 (2,341 reviews)

"Best typing experience I've had" - TechRadar Editor's Choice 2025

RETURN & REFUND POLICY:
We want you to be completely satisfied with your purchase. If you're not happy with your order, we offer the following:

- Full refunds within 30 days of delivery for unused items in original packaging
- Exchanges within 45 days for defective products
- Return shipping is free for defective items; $5.99 flat rate for other returns
- Refunds are processed within 5-7 business days after we receive the returned item
- Digital products and gift cards are non-refundable
- Sale items marked "Final Sale" cannot be returned

To initiate a return, visit our Returns Center or contact support@examplestore.com.
""",
    "search_results": """
Google Shopping Results for "MechaType Pro 75% Mechanical Keyboard"

1. BestBuy.com - MechaType Pro 75% - $74.99 (Sale!)
   Free shipping on orders over $35
   In stock - Ships in 1-2 days

2. Amazon.com - MechaType Pro 75% - $82.49
   Prime eligible - Free next-day delivery
   Only 12 left in stock

3. NewEgg.com - MechaType Pro 75% - $79.99
   Free shipping, arrives in 3-5 days
   Bundle deal: +$15 for wrist rest

4. Walmart.com - MechaType Pro 75% - $84.99
   Free pickup available
   Price match guarantee

5. MechaType.com (Official) - MechaType Pro 75% - $89.99
   Free shipping + 2-year warranty
   Customize switches and keycaps
""",
    "flights": """
Google Flights - Boston (BOS) to San Francisco (SFO)
Departing: Friday, Feb 14, 2026

1. JetBlue B6 415 - $247 (Nonstop)
   Depart: 7:00 AM → Arrive: 10:45 AM (5h 45m)
   Economy, 1 carry-on included

2. United UA 632 - $289 (Nonstop)
   Depart: 9:15 AM → Arrive: 1:05 PM (5h 50m)
   Economy, Wi-Fi available

3. Delta DL 1087 - $265 (1 stop ATL)
   Depart: 6:30 AM → Arrive: 1:20 PM (9h 50m)
   Economy, seat selection included

4. American AA 298 - $299 (Nonstop)
   Depart: 11:30 AM → Arrive: 3:15 PM (5h 45m)
   Economy, power outlets

5. Southwest WN 2241 - $198 (1 stop MDW)
   Depart: 8:00 AM → Arrive: 3:30 PM (10h 30m)
   Wanna Get Away fare, 2 free checked bags
""",
}

MOCK_EXTRACTIONS = {
    "refund policy": {
        "policy_type": "refund",
        "return_window": "30 days",
        "exchange_window": "45 days",
        "free_return_shipping": "defective items only",
        "processing_time": "5-7 business days",
        "exceptions": ["digital products", "gift cards", "Final Sale items"],
        "contact": "support@examplestore.com",
    },
    "product prices": [
        {"store": "BestBuy", "price": 74.99, "shipping": "Free", "url": "https://bestbuy.com"},
        {"store": "Amazon", "price": 82.49, "shipping": "Free (Prime)", "url": "https://amazon.com"},
        {"store": "NewEgg", "price": 79.99, "shipping": "Free", "url": "https://newegg.com"},
        {"store": "Walmart", "price": 84.99, "shipping": "Free pickup", "url": "https://walmart.com"},
        {"store": "Official", "price": 89.99, "shipping": "Free", "url": "https://mechatype.com"},
    ],
    "flights": [
        {"airline": "JetBlue", "price": 247, "departure": "7:00 AM", "duration": "5h 45m", "stops": 0},
        {"airline": "United", "price": 289, "departure": "9:15 AM", "duration": "5h 50m", "stops": 0},
        {"airline": "Delta", "price": 265, "departure": "6:30 AM", "duration": "9h 50m", "stops": 1},
        {"airline": "American", "price": 299, "departure": "11:30 AM", "duration": "5h 45m", "stops": 0},
        {"airline": "Southwest", "price": 198, "departure": "8:00 AM", "duration": "10h 30m", "stops": 1},
    ],
}


class BrowserController:
    def __init__(self):
        self.current_url = "https://examplestore.com/product/mechatype-pro-75"
        self.current_title = "MechaType Pro 75% Mechanical Keyboard - ExampleStore"

    async def get_page_context(self) -> dict:
        return {
            "url": self.current_url,
            "title": self.current_title,
            "domain": self.current_url.split("/")[2] if "/" in self.current_url else "",
        }

    async def read_page(self) -> str:
        if settings.web_agent_enabled:
            raise NotImplementedError("Real Web Agent SDK not yet integrated")

        logger.info(f"[MOCK] Reading page: {self.current_url}")
        if "google.com/search" in self.current_url or "shopping" in self.current_url.lower():
            return MOCK_PAGE_CONTENT["search_results"]
        if "flights" in self.current_url.lower():
            return MOCK_PAGE_CONTENT["flights"]
        return MOCK_PAGE_CONTENT["default"]

    async def navigate(self, url: str) -> dict:
        logger.info(f"[MOCK] Navigating to: {url}")
        self.current_url = url
        if "google.com" in url:
            self.current_title = "Google Search Results"
        elif "flights" in url.lower():
            self.current_title = "Google Flights"
        else:
            self.current_title = f"Page at {url}"
        return {"url": self.current_url, "title": self.current_title}

    async def extract_data(self, pattern: str) -> dict:
        logger.info(f"[MOCK] Extracting data with pattern: {pattern}")
        pattern_lower = pattern.lower()
        for key, data in MOCK_EXTRACTIONS.items():
            if key in pattern_lower:
                return {"pattern": pattern, "data": data}
        return {"pattern": pattern, "data": "No matching data found"}

    async def click(self, selector: str) -> dict:
        logger.info(f"[MOCK] Clicking: {selector}")
        return {"clicked": selector, "success": True}
