# Browser test: recording with no connection (saved on the phone, sent later), and checking MoMo SMS.
# Run against a FRESH database with the production build served on :4000:  python e2e/test_offline_momo.py
import os
import re
from datetime import date
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

    # A MoMo sale with its transaction ID
    page.goto(BASE + "/record/sale")
    page.get_by_label(re.compile("How much did you receive")).fill("50")
    page.get_by_text("MTN MoMo", exact=True).click()
    page.get_by_label("MoMo ID (optional)").fill("51234567890")
    page.get_by_role("button", name="Save sale").click()
    expect(page.get_by_text(re.compile("saved"))).to_be_visible()

    # Make sure the app is stored on the phone, and the record screen's data has been seen once
    page.goto(BASE + "/record/sale")
    expect(page.get_by_text("Cash box", exact=True)).to_be_visible()
    page.evaluate("navigator.serviceWorker.ready.then(() => true)")
    page.wait_for_timeout(1500)

    # No connection
    ctx.set_offline(True)
    page.goto(BASE + "/record/sale")
    page.get_by_label(re.compile("How much did you receive")).fill("40")
    page.get_by_text("Cash box", exact=True).click()
    page.get_by_role("button", name="Save sale").click()
    expect(page.get_by_text("No connection: GHS 40.00 saved on this phone. It will be sent when you are back online.")).to_be_visible()
    expect(page.get_by_text(re.compile("1 record\\(s\\) saved on this phone"))).to_be_visible()
    expect(page.get_by_text(re.compile("No connection. These are the figures saved on this phone"))).to_be_visible()
    shot(page, "o1-offline.png")

    # Back online: it is sent by itself when the connection returns
    ctx.set_offline(False)
    expect(page.get_by_text(re.compile("saved on this phone, waiting"))).to_have_count(0, timeout=15000)
    page.goto(BASE + "/")
    expect(page.get_by_text("GHS 590.00").first).to_be_visible()

    # Check MoMo SMS messages
    today = date.today().isoformat()
    page.goto(BASE + "/close-day")
    page.get_by_role("link", name=re.compile("Check MoMo payments")).click()
    page.get_by_label("Paste the MoMo SMS messages, or a statement").fill(
        f"Payment received for GHS 50.00 from KOFI MENSAH Current Balance: GHS 50.00. Transaction ID: 51234567890 on {today} 09:15\n\n"
        f"Payment received for GHS 200.00 from AKUA BOATENG Current Balance: GHS 250.00. Transaction ID: 51234567891 on {today} 11:40")
    page.get_by_role("button", name="Check").click()
    expect(page.locator(".statement-row", has_text="Already in your records")).to_contain_text("1")
    expect(page.locator(".statement-row", has_text="Not in your records")).to_contain_text("1")
    expect(page.get_by_text(re.compile("AKUA BOATENG · ID 51234567891"))).to_be_visible()
    page.get_by_role("button", name="Add as a sale").click()
    expect(page.get_by_text("Added as a sale")).to_be_visible()
    shot(page, "o2-momo-check.png")
    page.get_by_role("button", name="Check").click()
    expect(page.get_by_text("Everything matches.")).to_be_visible()

    assert not [e for e in errors if "Failed to fetch" not in e], errors
    browser.close()
    print("OFFLINE AND MOMO E2E PASSED")
