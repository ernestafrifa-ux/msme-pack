# Browser test: selling on credit, customers who owe, receipts, and supplier bills with reminders.
# Run against a FRESH database with the server on :4000:  python e2e/test_customers_receipts.py
import os
import re
from datetime import date, timedelta
from playwright.sync_api import sync_playwright, expect
from common import onboard_to_setup

BASE = os.environ.get("BASE_URL", "http://localhost:4000")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
os.makedirs(OUT, exist_ok=True)
errors = []


def shot(page, name):
    vp = page.viewport_size
    page.screenshot(path=f"{OUT}/{name}", full_page=True)
    page.set_viewport_size(vp)
    page.wait_for_timeout(150)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))

    onboard_to_setup(page, BASE, "Adwoa Mensah", "0244560077", "books-2026", "Adom Books & Stationery")
    page.get_by_label("Cash in the business box today (GHS)").fill("500")
    page.get_by_role("button", name="Start keeping records").click()
    expect(page.get_by_text("GHS 500.00").first).to_be_visible()

    page.goto(BASE + "/stock/new")
    page.get_by_label("Product name").fill("Exercise book")
    page.get_by_label(re.compile("^Cost price")).fill("10")
    page.get_by_label(re.compile("^Selling price")).fill("20")
    page.get_by_label("How many you have now").fill("50")
    page.get_by_role("button", name="Add product").click()
    expect(page.get_by_role("heading", name="Exercise book")).to_be_visible()

    # A sale paid later
    page.goto(BASE + "/record/sale")
    page.get_by_role("button", name="Add products").click()
    page.get_by_role("dialog").get_by_role("button", name=re.compile("Exercise book")).click()
    page.get_by_role("button", name="Done").click()
    page.get_by_label("Quantity of Exercise book").fill("5")
    page.get_by_text("Paid later (the customer owes)").click()
    expect(page.get_by_text("Where did the money go?")).to_have_count(0)
    page.get_by_label("Customer’s name").fill("Auntie Akos")
    page.get_by_label("Phone (optional)").fill("0241231234")
    page.get_by_label("Pay by (optional)").fill((date.today() + timedelta(days=7)).isoformat())
    shot(page, "c1-sale-on-credit.png")
    page.get_by_role("button", name="Save sale").click()
    expect(page.get_by_text("Sale of GHS 100.00 to Auntie Akos saved. They owe you until they pay.")).to_be_visible()
    expect(page.locator(".money-total")).to_have_text("GHS 100.00")

    # She pays 60 in cash; send her a receipt
    page.get_by_role("button", name="Record money received").click()
    page.get_by_label(re.compile("Amount \\(GHS\\)")).fill("60")
    page.get_by_text("Cash box", exact=True).click()
    page.get_by_role("button", name="Save", exact=True).click()
    expect(page.get_by_text("GHS 60.00 received. Still owed: GHS 40.00.")).to_be_visible()
    href = page.get_by_role("link", name="Send a reminder on WhatsApp").get_attribute("href")
    assert href.startswith("https://wa.me/233241231234?text=") and "40.00" in href, href
    shot(page, "c2-customer.png")
    page.get_by_role("link", name="Receipt for GHS 60.00").click()
    expect(page.locator(".receipt")).to_contain_text("RECEIPT")
    expect(page.locator(".receipt")).to_contain_text("Received from")
    expect(page.locator(".receipt")).to_contain_text("60.00")

    page.goto(BASE + "/customers")
    expect(page.get_by_text("GHS 40.00").first).to_be_visible()

    # A cash sale, then the receipt from Home's message
    page.goto(BASE + "/record/sale")
    page.get_by_label(re.compile("How much did you receive")).fill("35")
    page.get_by_role("button", name="Save sale").click()
    page.get_by_role("link", name="Send a receipt").click()
    expect(page.locator(".receipt")).to_contain_text("No. 0002")
    page.get_by_label("Customer’s WhatsApp number (optional)").fill("020 111 2222")
    wa = page.get_by_role("link", name="Send on WhatsApp").get_attribute("href")
    assert wa.startswith("https://wa.me/233201112222?text=") and "%2Fr%2F" in wa, wa
    shot(page, "c3-receipt.png")
    public = page.get_by_role("link", name="Print / PDF").get_attribute("href")
    stranger = browser.new_context(viewport={"width": 390, "height": 844}).new_page()
    stranger.goto(BASE + public)
    expect(stranger.locator(".receipt")).to_contain_text("Adom Books & Stationery")
    expect(stranger.locator(".receipt")).to_contain_text("35.00")

    # Stock bought on credit with a pay-by date: reminder on Home
    page.goto(BASE + "/record/purchase")
    page.get_by_role("button", name="Add products").click()
    page.get_by_role("dialog").get_by_role("button", name=re.compile("Exercise book")).click()
    page.get_by_role("button", name="Done").click()
    page.get_by_label("Quantity of Exercise book").fill("10")
    page.get_by_text("Paid later (bought on credit)").click()
    page.get_by_label("Who did you buy from?").fill("Kejetia Wholesale")
    page.get_by_label("Pay by (optional)").fill((date.today() + timedelta(days=3)).isoformat())
    page.get_by_role("button", name="Save stock bought").click()
    page.goto(BASE + "/")
    expect(page.get_by_text(re.compile("Pay Kejetia Wholesale GHS 100.00 by"))).to_be_visible()
    expect(page.get_by_text(re.compile("Customers owe you GHS 40.00|owe you GHS 40.00"))).to_be_visible()
    shot(page, "c4-home-reminders.png")

    assert not errors, errors
    browser.close()
    print("CUSTOMERS AND RECEIPTS E2E PASSED")
