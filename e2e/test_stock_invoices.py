# Browser test of stock and invoices.
# Needs: pip install playwright && playwright install chromium
# Run against a FRESH database with the server on :4000:  python e2e/test_stock_invoices.py
import os
import re
from playwright.sync_api import sync_playwright, expect
from common import onboard_to_setup, log_out, first_login

BASE = os.environ.get("BASE_URL", "http://localhost:4000")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
os.makedirs(OUT, exist_ok=True)
errors = []


def shot(page, name):
    """Full-page screenshot, then restore the viewport so later clicks land normally."""
    vp = page.viewport_size
    page.screenshot(path=f"{OUT}/{name}", full_page=True)
    page.set_viewport_size(vp)
    page.evaluate("document.activeElement && document.activeElement.blur()")
    page.wait_for_timeout(150)


PATHS = {"Home": "/", "Records": "/records", "Record": "/record/sale", "Stock": "/stock", "Invoices": "/invoices"}


def nav(page, name):
    """Use the bottom bar when the screen has one; detail screens have a back button instead."""
    bar = page.get_by_role("navigation", name="Main")
    if bar.count():
        bar.get_by_role("link", name=name, exact=True).click()
        expect(page).to_have_url(BASE + PATHS[name])
    else:
        page.goto(BASE + PATHS[name])


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))

    # --- Sign up and set up ---------------------------------------------------
    onboard_to_setup(page, BASE, "Ama Mensah", "0244440001", "shito-2026", "Ama's Shito & Spices")
    page.get_by_label("Cash in the business box today (GHS)").fill("300")
    page.get_by_role("button", name="Start keeping records").click()
    expect(page.get_by_text("GHS 300.00")).to_be_visible()

    # --- Products ------------------------------------------------------------
    nav(page, "Stock")
    expect(page.get_by_text("No products yet.")).to_be_visible()
    page.get_by_role("link", name="Add your first product").click()
    page.get_by_label("Product name").fill("Shito 250ml jar")
    page.get_by_label("Counted in").select_option("jar")
    page.get_by_label("Cost price (GHS)").fill("12")
    page.get_by_label("Selling price (GHS)").fill("25")
    expect(page.get_by_text("You make GHS 13.00 on each one (52% of the price).")).to_be_visible()
    page.get_by_label("How many you have now").fill("30")
    page.get_by_label("Warn me below").fill("20")
    shot(page, "s1-product-form.png")
    page.get_by_role("button", name="Add product").click()
    expect(page.get_by_text("Shito 250ml jar added.")).to_be_visible()
    expect(page.locator(".money-total")).to_have_text("30 jar")

    # Made a batch: +5
    page.get_by_role("button", name="Made some").click()
    page.get_by_label("How many jar made").fill("5")
    page.get_by_role("button", name="Save", exact=True).click()
    expect(page.locator(".money-total")).to_have_text("35 jar")
    expect(page.get_by_text("5 jar made.")).to_be_visible()

    page.goto(BASE + "/stock/new")
    page.get_by_label("Product name").fill("Ground pepper 100g")
    page.get_by_label("Counted in").select_option("sachet")
    page.get_by_label("Cost price (GHS)").fill("7")
    page.get_by_label("Selling price (GHS)").fill("15")
    page.get_by_label("How many you have now").fill("15")
    page.get_by_label("Warn me below").fill("10")
    page.get_by_role("button", name="Add product").click()
    expect(page.locator(".money-total")).to_have_text("15 sachet")

    page.goto(BASE + "/stock/new")
    page.get_by_role("button", name="Service").click()
    page.get_by_label("Service name").fill("Catering per tray")
    page.get_by_label("Selling price (GHS)").fill("100")
    page.get_by_role("button", name="Add service").click()
    expect(page.get_by_text("Add it to invoices; it has no stock.")).to_be_visible()

    # --- Sale with products ----------------------------------------------------
    nav(page, "Record")
    page.get_by_role("button", name="Add products").click()
    # Services can be sold from the product list too
    expect(page.get_by_role("dialog", name="Choose a product").get_by_role("button", name=re.compile("Catering per tray"))).to_be_visible()
    page.get_by_role("dialog", name="Choose a product").get_by_role("button", name=re.compile("Shito 250ml jar")).click()
    page.get_by_role("dialog", name="Choose a product").get_by_role("button", name=re.compile("Ground pepper")).click()
    page.get_by_role("button", name="Done").click()
    page.get_by_role("button", name="One more Shito 250ml jar").click()
    expect(page.locator(".total-val")).to_have_text("GHS 65.00")
    page.get_by_text("Cash box", exact=True).click()
    shot(page, "s2-sale-with-products.png")
    page.get_by_role("button", name="Save sale").click()
    expect(page.get_by_text("Sale of GHS 65.00 saved.")).to_be_visible()

    # --- Buy stock -------------------------------------------------------------
    page.get_by_role("link", name="Buy stock").click()
    page.get_by_role("button", name="Add products").click()
    expect(page.get_by_role("dialog").get_by_role("button", name=re.compile("Catering per tray"))).to_have_count(0)  # not stock
    page.get_by_role("dialog").get_by_role("button", name=re.compile("Ground pepper")).click()
    page.get_by_role("button", name="Done").click()
    page.get_by_label("Quantity of Ground pepper 100g").fill("10")
    page.get_by_label("Cost of one Ground pepper 100g (GHS)").fill("7.50")
    expect(page.locator(".total-val")).to_have_text("GHS 75.00")
    page.get_by_role("button", name="Save stock bought").click()
    expect(page.get_by_text("Stock bought for GHS 75.00 saved.")).to_be_visible()
    # Cash: 300 + 65 − 75
    expect(page.get_by_text("GHS 290.00")).to_be_visible()

    nav(page, "Stock")
    row = lambda name: page.locator(".product-row", has_text=name)
    expect(row("Shito 250ml jar").locator(".txn-amt")).to_have_text("33")
    expect(row("Ground pepper").locator(".txn-amt")).to_have_text("24")
    shot(page, "s3-stock.png")

    # --- Invoice ------------------------------------------------------------------
    nav(page, "Invoices")
    expect(page.get_by_text("No invoices yet.")).to_be_visible()
    page.get_by_role("link", name="Invoice").first.click()
    expect(page).to_have_url(BASE + "/invoices/new")
    page.get_by_label("Name").fill("Adwoa Provisions")
    page.get_by_label("Phone (for WhatsApp)").fill("020 123 4567")
    page.get_by_role("button", name="Product").click()
    page.get_by_role("dialog").get_by_role("button", name=re.compile("Shito 250ml jar")).click()
    page.get_by_label("Quantity of Shito 250ml jar").fill("15")
    page.get_by_role("button", name="Other item").click()
    page.get_by_label("Description of item 2").fill("Delivery to Adum")
    page.get_by_label("Price of one Delivery to Adum (GHS)").fill("20")
    page.get_by_label("Discount (GHS, optional)").fill("5")
    page.get_by_label("How to pay you").fill("MoMo 024 444 0001 (Ama Mensah)")
    expect(page.locator(".totals-grand")).to_contain_text("GHS 390.00")
    shot(page, "s4-invoice-form.png")
    page.get_by_role("button", name="Save as draft").click()

    expect(page.get_by_text("Draft saved.")).to_be_visible()
    expect(page.locator(".pill")).to_have_text("Draft")
    wa = page.get_by_role("link", name="Send on WhatsApp")
    href = wa.get_attribute("href")
    assert href.startswith("https://wa.me/233201234567?text="), href
    assert "INV-0001" in href and "390.00" in href, href
    page.get_by_role("button", name="I gave it another way (mark as sent)").click()
    expect(page.locator(".inv-summary .pill")).to_have_text("Sent")

    page.get_by_role("button", name="Record money received").click()
    expect(page.get_by_label(re.compile("Amount \\(GHS\\)"))).to_have_value("390.00")
    page.get_by_label(re.compile("Amount \\(GHS\\)")).fill("200")
    page.get_by_text("Cash box", exact=True).click()
    page.get_by_role("button", name="Save payment").click()
    expect(page.get_by_text("Payment of GHS 200.00 saved.")).to_be_visible()
    expect(page.locator(".inv-summary .pill")).to_have_text("Part paid")
    expect(page.locator(".inv-amount")).to_have_text("GHS 190.00")
    shot(page, "s5-invoice-detail.png")

    # Customer's link, opened by someone who is not logged in
    public_path = page.get_by_role("link", name="Print / PDF").get_attribute("href")
    stranger = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2).new_page()
    stranger.goto(BASE + public_path)
    expect(stranger.get_by_text("INV-0001")).to_be_visible()
    expect(stranger.get_by_text("Adwoa Provisions")).to_be_visible()
    expect(stranger.locator(".paper-strong", has_text="Still to pay")).to_contain_text("190.00")
    expect(stranger.get_by_role("button", name="Print or save as PDF")).to_be_visible()
    stranger.screenshot(path=f"{OUT}/s6-public-invoice.png", full_page=True)

    # --- Home shows what needs attention --------------------------------------
    nav(page, "Home")
    expect(page.get_by_text("Customers owe you")).to_contain_text("GHS 190.00")
    expect(page.get_by_text("is running low")).to_contain_text("18 jar left")
    # Cash: 290 + 200 received
    expect(page.locator(".money-total")).to_have_text("GHS 490.00")
    shot(page, "s7-home.png")

    # --- Stock count -----------------------------------------------------------------
    nav(page, "Stock")
    page.get_by_role("link", name="Do a stock count").click()
    page.get_by_label("Shito 250ml jar").fill("17")
    page.get_by_role("button", name="Save count (1 difference)").click()
    expect(page.get_by_text("Stock count saved: 1 item(s) corrected.")).to_be_visible()
    expect(row("Shito 250ml jar").locator(".txn-amt")).to_have_text("17")
    nav(page, "Home")
    expect(page.get_by_text(re.compile(r"Includes GHS [0-9.,]+ of damaged or missing stock\."))).to_be_visible()

    # --- Records show what happened --------------------------------------------------
    nav(page, "Records")
    expect(page.get_by_text("INV-0001 payment · Adwoa Provisions")).to_be_visible()
    expect(page.get_by_text("Shito 250ml jar ×2, Ground pepper 100g ×1").or_(page.get_by_text("Ground pepper 100g ×1, Shito 250ml jar ×2"))).to_be_visible()
    expect(page.get_by_text("Ground pepper 100g ×10")).to_be_visible()
    shot(page, "s8-records.png")

    # Narrow phones: nothing wider than the screen
    overflow = {}
    for path in ["/", "/stock", "/invoices", "/record/sale"]:
        page.goto(BASE + path)
        page.set_viewport_size({"width": 320, "height": 640})
        page.wait_for_timeout(300)
        overflow[path] = page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
    browser.close()

print("page errors:", errors)
print("horizontal overflow at 320px:", overflow)
assert not errors, errors
assert not any(overflow.values()), overflow
print("STOCK AND INVOICES E2E PASSED")
