# Browser test: an owner uploads the business logo; the admin sends messages, by region and to all.
# Run against a FRESH database with the server on :4000:  python e2e/test_logo_messages.py
import os
import re
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright, expect
from common import create_admin, admin_creates_business, log_out, first_login, ADMIN_PHONE, ADMIN_PASSWORD

BASE = os.environ.get("BASE_URL", "http://localhost:4000")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
os.makedirs(OUT, exist_ok=True)
errors = []


def shot(page, name):
    vp = page.viewport_size
    page.screenshot(path=f"{OUT}/{name}", full_page=True)
    page.set_viewport_size(vp)
    page.wait_for_timeout(150)


# A 1200×1200 "photo" of a logo, which the app shrinks before uploading.
logo_path = os.path.join(OUT, "adom-logo.png")
img = Image.new("RGB", (1200, 1200), "#1F5C46")
d = ImageDraw.Draw(img)
d.ellipse((150, 150, 1050, 1050), fill="#F2C14E")
d.rectangle((420, 380, 780, 820), fill="#1F5C46")
img.save(logo_path)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page.on("pageerror", lambda e: errors.append(str(e)))

    create_admin(page, BASE)
    admin_creates_business(page, BASE, "Adom Books & Stationery", "Adwoa Mensah", "0244560077", "temp-pass-1", region="Ashanti", town="Kumasi")
    admin_creates_business(page, BASE, "Kofi Electricals", "Kofi Boateng", "0209998888", "temp-kofi-1", region="Greater Accra")

    # Message to Ashanti only, then to everyone
    page.get_by_role("link", name=re.compile("Send a message")).click()
    page.get_by_label("Title").fill("Ashanti traders fair")
    page.get_by_label("Message").fill("Stalls are available at the Kumasi traders fair on 30 October. Call the GEA office to book.")
    page.get_by_text("By region").click()
    page.get_by_text("Ashanti", exact=True).click()
    expect(page.get_by_text(re.compile("This reaches 1 business"))).to_be_visible()
    page.get_by_role("button", name="Send message").click()
    expect(page.get_by_text("Message sent to 1 business. They see it on their Home screen.")).to_be_visible()

    page.get_by_label("Title").fill("Learn how VAT works in 2026")
    page.get_by_label("Message").fill("The tax guide has been updated with the 2026 VAT and withholding tax rates.")
    page.get_by_label("Link (optional)").fill("/learn/tax-basics")
    expect(page.get_by_text(re.compile("This reaches 2 businesses"))).to_be_visible()
    page.get_by_role("button", name="Send message").click()
    expect(page.get_by_text("Message sent to 2 businesses. They see it on their Home screen.")).to_be_visible()
    expect(page.get_by_text("Read in 0 of 2 businesses")).to_be_visible()
    log_out(page, BASE)

    # The owner sees both on Home
    first_login(page, BASE, "0244560077", "temp-pass-1", "books-2026")
    page.get_by_label("Cash in the business box today (GHS)").fill("1000")
    page.get_by_role("button", name="Start keeping records").click()
    expect(page.get_by_text("New message from MSME Pack")).to_be_visible()
    expect(page.locator(".bell-badge")).to_have_text("2")
    expect(page.locator(".biz-logo-initials")).to_have_text("AB")
    shot(page, "m1-home-message.png")
    page.get_by_role("link", name="Messages, 2 new").click()
    expect(page.get_by_role("heading", name=re.compile("Ashanti traders fair"))).to_be_visible()
    shot(page, "m2-messages.png")
    page.get_by_role("link", name="Open").click()
    expect(page.get_by_role("heading", name="Tax basics for small businesses")).to_be_visible()
    page.goto(BASE + "/")
    expect(page.locator(".bell-badge")).to_have_count(0)
    expect(page.get_by_text("New message from MSME Pack")).to_have_count(0)

    # Logo
    page.goto(BASE + "/settings")
    page.locator("input[type=file]").set_input_files(logo_path)
    expect(page.get_by_text("Logo saved. It now shows on Home, your invoices and statements.")).to_be_visible()
    expect(page.get_by_role("button", name="Change logo")).to_be_visible()
    shot(page, "m3-logo-settings.png")
    page.goto(BASE + "/")
    logo = page.get_by_role("img", name="Adom Books & Stationery logo")
    expect(logo).to_be_visible()
    src = logo.get_attribute("src")
    assert re.match(r"^/media/logos/.+\.(webp|png)$", src), src
    size = page.evaluate("(s) => fetch(s).then(r => r.blob()).then(b => b.size)", src)
    assert size < 60000, f"logo should be shrunk, got {size} bytes"
    shot(page, "m4-home-logo.png")
    page.goto(BASE + "/reports/profit-loss")
    expect(page.locator(".statement-logo")).to_be_visible()
    log_out(page, BASE)

    # The admin sees it read in 1 business, and the logo in the list
    page.get_by_label("Phone number").fill(ADMIN_PHONE)
    page.get_by_label("Password").fill(ADMIN_PASSWORD)
    page.get_by_role("button", name="Log in").click()
    expect(page.get_by_role("img", name="Adom Books & Stationery logo")).to_be_visible()
    page.get_by_role("link", name=re.compile("Send a message")).click()
    expect(page.get_by_text("Read in 1 of 2 businesses")).to_be_visible()
    shot(page, "m5-admin-messages.png")

    assert not errors, errors
    browser.close()
    print("LOGO AND MESSAGES E2E PASSED")
