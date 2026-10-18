# Browser test of the whole sign-up and cash book flow.
# Needs: pip install playwright && playwright install chromium
# Run against a FRESH database with the server on :4000:  python e2e/test_flow.py

import os
import re
from playwright.sync_api import sync_playwright, expect

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

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(BASE + "/")
    expect(page).to_have_url(BASE + "/login")
    page.get_by_role("link", name="Create an account").click()
    page.get_by_label("Your full name").fill("Ama Mensah")
    page.get_by_label("Phone number").fill("024 555 0101")
    page.get_by_label("Choose a password").fill("short")
    page.get_by_role("button", name="Create account").click()
    expect(page.get_by_text("Use at least 8 characters.")).to_be_visible()
    page.screenshot(path=f"{OUT}/1-signup-error.png")
    page.get_by_label("Choose a password").fill("shito-2026")
    page.get_by_label("Language you prefer").select_option("ee")  # no Ewe interface yet: stays English
    page.get_by_role("button", name="Create account").click()

    expect(page).to_have_url(BASE + "/setup")
    page.get_by_label("Business name").fill("Ama's Shito & Spices")
    page.get_by_text("Agro-processing", exact=True).click()
    page.get_by_label("Region").select_option(label="Ashanti")
    page.get_by_label("Town").fill("Kumasi")
    page.get_by_text("Yes, sole proprietorship").click()
    page.get_by_label("Cash in the business box today (GHS)").fill("500")
    page.get_by_label("Balance today (GHS)").fill("200")
    shot(page, "2-setup.png")
    page.get_by_role("button", name="Start keeping records").click()

    expect(page).to_have_url(BASE + "/")
    expect(page.get_by_text("GHS 700.00")).to_be_visible()
    page.screenshot(path=f"{OUT}/3-home-empty.png")

    # Sale to MoMo, save and add another
    page.get_by_role("link", name="Sale").first.click()
    page.get_by_label("How much did you receive? (GHS)").fill("625")
    page.get_by_text("MTN MoMo", exact=True).click()
    page.get_by_label("What was sold?").select_option(label="Product sales")
    page.get_by_label("MoMo ID (optional)").fill("MP261015.1234")
    page.get_by_label("MoMo fee (optional)").fill("2.50")
    page.get_by_label("Note (optional)").fill("25 jars")
    shot(page, "4-record-sale.png")
    page.get_by_role("button", name="Save and add another").click()
    expect(page.get_by_text("Sale of GHS 625.00 saved.")).to_be_visible()
    # Next sale, cash
    page.get_by_label("How much did you receive? (GHS)").fill("250")
    page.get_by_text("Cash box", exact=True).click()
    page.get_by_role("button", name="Save sale").click()
    expect(page.get_by_text("Sale of GHS 250.00 saved.")).to_be_visible()

    # Expense with a validation error first
    page.get_by_role("link", name="Expense").click()
    page.get_by_role("button", name="Save expense").click()
    expect(page.get_by_text("Enter an amount.").or_(page.get_by_text("Amount must be more than zero."))).to_be_visible()
    page.get_by_label("How much did you spend? (GHS)").fill("40")
    page.get_by_label("What was it for?").select_option(label="Transport")
    page.get_by_role("button", name="Save expense").click()
    expect(page).to_have_url(BASE + "/")

    # Transfer cash -> MoMo
    page.get_by_role("navigation", name="Main").get_by_role("link", name="Record", exact=True).click()
    page.get_by_role("tab", name="Transfer").click()
    page.get_by_label("How much did you move? (GHS)").fill("300")
    page.get_by_role("button", name="Save transfer").click()
    expect(page).to_have_url(BASE + "/")

    # 500+250-40-300 = 410 cash ; 200+625-2.5+300 = 1122.50 ; total 1532.50
    expect(page.get_by_text("GHS 1,532.50")).to_be_visible()
    expect(page.get_by_text("410.00", exact=True)).to_be_visible()
    expect(page.get_by_text("1,122.50", exact=True)).to_be_visible()
    expect(page.get_by_text("832.50", exact=True)).to_be_visible()  # 875 - 40 - 2.50
    shot(page, "5-home.png")

    # Records: filter and delete the expense
    page.get_by_role("navigation", name="Main").get_by_role("link", name="Records").click()
    shot(page, "6-records.png")
    page.get_by_role("button", name="Expenses").click()
    expect(page.get_by_text("Transport")).to_be_visible()
    page.on("dialog", lambda d: d.accept())
    page.get_by_role("button", name="Delete Transport, 40.00").click()
    expect(page.get_by_text("Nothing recorded here yet.")).to_be_visible()
    page.get_by_role("navigation", name="Main").get_by_role("link", name="Home").click()
    expect(page.get_by_text("GHS 1,572.50")).to_be_visible()

    # Owner pay: money leaves the cash box, profit stays the same
    expect(page.get_by_text("872.50", exact=True)).to_be_visible()  # 875 - 2.50
    expect(page.locator(".owner-pay")).to_have_count(0)
    page.get_by_role("navigation", name="Main").get_by_role("link", name="Record", exact=True).click()
    page.get_by_role("tab", name="Owner pay").click()
    expect(page.get_by_text("It is not a business expense")).to_be_visible()
    page.get_by_label("How much did you take for yourself? (GHS)").fill("100")
    page.get_by_label("Cash box").check()
    shot(page, "6b-owner-pay.png")
    page.get_by_role("button", name="Save owner pay").click()
    expect(page).to_have_url(BASE + "/")
    expect(page.get_by_text("Owner pay of GHS 100.00 saved.")).to_be_visible()
    expect(page.get_by_text("GHS 1,472.50")).to_be_visible()
    expect(page.get_by_text("872.50", exact=True)).to_be_visible()  # unchanged
    expect(page.get_by_text("You paid yourself GHS 100.00 this month.")).to_be_visible()
    page.get_by_role("navigation", name="Main").get_by_role("link", name="Records").click()
    page.get_by_role("button", name="Owner pay", exact=True).click()
    expect(page.locator(".txn")).to_have_count(1)
    expect(page.locator(".txn").first).to_contain_text("100.00")
    # Receipts and payments account adds up to the same money as Home
    page.get_by_role("link", name="Reports").click()
    page.get_by_role("link", name=re.compile("^Receipts & payments")).click()
    expect(page.get_by_role("heading", name="Receipts and payments account")).to_be_visible()
    expect(page.locator(".statement-table .total")).to_contain_text("1,472.50")
    expect(page.get_by_role("alert")).to_have_count(0)
    shot(page, "6c-receipts-payments.png")
    page.goto(BASE + "/records")
    page.get_by_role("navigation", name="Main").get_by_role("link", name="Home").click()

    # Reload keeps you logged in; log out and back in
    page.reload()
    expect(page.get_by_text("Ama's Shito & Spices")).to_be_visible()
    expect(page.get_by_text("GHS 1,472.50")).to_be_visible()
    page.get_by_role("link", name="Business details and log out").click()
    page.get_by_role("button", name="Log out").click()
    expect(page).to_have_url(BASE + "/login")
    page.get_by_label("Phone number").fill("+233245550101")
    page.get_by_label("Password").fill("wrong-password")
    page.get_by_role("button", name="Log in").click()
    expect(page.get_by_text("Phone number or password is not correct.")).to_be_visible()
    page.get_by_label("Password").fill("shito-2026")
    page.get_by_role("button", name="Log in").click()
    expect(page.get_by_text("GHS 1,472.50")).to_be_visible()

    # Narrow phone check: nothing wider than the screen
    page.set_viewport_size({"width": 320, "height": 640})
    overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
    page.screenshot(path=f"{OUT}/7-home-320.png")
    page.goto(BASE + "/record/owner_draw")
    page.wait_for_timeout(300)
    overflow = overflow or page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
    page.screenshot(path=f"{OUT}/8-owner-pay-320.png")
    b.close()

print("console errors:", errors)
print("horizontal overflow at 320px:", overflow)
print("E2E PASSED")
