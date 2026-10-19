# Browser test: admin groups, a question on a message, and the programme dashboard with consent.
# Run against a FRESH database with the server on :4000:  python e2e/test_programme.py
import os
import re
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


def login(page, phone, password):
    page.goto(BASE + "/login")
    page.get_by_label("Phone number").fill(phone)
    page.get_by_label("Password").fill(password)
    page.get_by_role("button", name="Log in").click()


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page.on("pageerror", lambda e: errors.append(str(e)))

    create_admin(page, BASE)
    admin_creates_business(page, BASE, "Adom Books & Stationery", "Adwoa Mensah", "0244560077", "temp-pass-1", region="Eastern", town="Nkawkaw")
    admin_creates_business(page, BASE, "Kofi Electricals", "Kofi Boateng", "0209998888", "temp-kofi-1", region="Eastern", town="Mpraeso")

    # A group with both
    page.goto(BASE + "/admin")
    page.get_by_role("link", name=re.compile("Groups")).click()
    page.get_by_role("button", name="New group").click()
    page.get_by_label("Group name").fill("BizBox Kwahu West 2026")
    page.get_by_text("Adom Books & Stationery").click()
    page.get_by_text("Kofi Electricals").click()
    page.get_by_role("button", name="Save group").click()
    expect(page.get_by_text("BizBox Kwahu West 2026 saved with 2 businesses.")).to_be_visible()

    # A message with a question, to the group
    page.goto(BASE + "/admin/notices")
    page.get_by_label("Title").fill("Record-keeping training")
    page.get_by_label("Message").fill("Friday 10 am at the GEA office, Nkawkaw.")
    page.get_by_text("A group", exact=True).click()
    page.get_by_text("BizBox Kwahu West 2026 (2)").click()
    page.get_by_label("Question (optional)").fill("Will you attend?")
    page.get_by_label("Answers to choose from, one per line").fill("Yes\nNo\nNot sure")
    expect(page.get_by_text(re.compile("This reaches 2 businesses"))).to_be_visible()
    page.get_by_role("button", name="Send message").click()
    expect(page.get_by_text(re.compile("Message sent to 2 businesses"))).to_be_visible()
    log_out(page, BASE)

    # Adwoa: sets up, records a sale, agrees to share, answers
    first_login(page, BASE, "0244560077", "temp-pass-1", "books-2026")
    page.get_by_label("Cash in the business box today (GHS)").fill("500")
    page.get_by_role("button", name="Start keeping records").click()
    page.goto(BASE + "/record/sale")
    page.get_by_label(re.compile("How much did you receive")).fill("900")
    page.get_by_role("button", name="Save sale").click()
    page.goto(BASE + "/settings")
    page.get_by_text("Share my summary figures with the MSME Pack team").click()
    expect(page.get_by_text(re.compile("Your summary figures are now shared"))).to_be_visible()
    page.goto(BASE + "/notices")
    page.get_by_role("button", name="Yes", exact=True).click()
    expect(page.get_by_text("Thank you. You can change your answer.")).to_be_visible()
    shot(page, "pg1-question.png")
    log_out(page, BASE)

    # The admin sees the answer and the dashboard
    login(page, ADMIN_PHONE, ADMIN_PASSWORD)
    page.get_by_role("link", name=re.compile("Send a message")).click()
    results = page.locator(".survey-results")
    expect(results).to_contain_text("Will you attend?")
    expect(results.locator(".statement-row", has_text="Yes")).to_contain_text("1")
    page.goto(BASE + "/admin/dashboard")
    page.get_by_label("Group").select_option(label="BizBox Kwahu West 2026")
    expect(page.locator(".pack-tile", has_text="Sharing figures")).to_contain_text("1")
    rows = page.locator(".pack-table tbody tr")
    expect(rows.filter(has_text="Adom Books & Stationery")).to_contain_text("900.00")
    expect(rows.filter(has_text="Kofi Electricals")).to_contain_text("not shared")
    shot(page, "pg2-dashboard.png")

    assert not errors, errors
    browser.close()
    print("PROGRAMME E2E PASSED")
