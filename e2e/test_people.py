# Browser test: the admin sets up a business without balances; the owner enters them, adds a
# staff member; the staff member logs in, chooses a password and sees only that business.
# Run against a FRESH database with the server on :4000:  python e2e/test_people.py
import os
import re
from playwright.sync_api import sync_playwright, expect
from common import create_admin, admin_creates_business, log_out, first_login

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
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page.on("pageerror", lambda e: errors.append(str(e)))

    create_admin(page, BASE)
    admin_creates_business(page, BASE, "Adom Books & Stationery", "Adwoa Mensah", "0244560077", "temp-pass-1",
                           town="Kumasi", region="Ashanti")
    admin_creates_business(page, BASE, "Kofi Electricals", "Kofi Boateng", "0209998888", "temp-kofi-1")
    expect(page.get_by_role("heading", name="2 businesses")).to_be_visible()
    expect(page.get_by_text("waiting for owner").first).to_be_visible()
    shot(page, "p1-admin-list.png")
    log_out(page, BASE)

    # Owner: first login, new password, today's balances
    first_login(page, BASE, "0244560077", "temp-pass-1", "books-2026")
    page.get_by_label("Cash in the business box today (GHS)").fill("1000")
    page.get_by_role("button", name="Start keeping records").click()
    expect(page.get_by_text("GHS 1,000.00").first).to_be_visible()

    # Owner adds a staff member
    page.goto(BASE + "/settings")
    people = page.locator("section", has=page.get_by_role("heading", name="People who use this business"))
    expect(people.get_by_text("Adwoa Mensah (you)")).to_be_visible()
    people.get_by_role("button", name="Add a person").click()
    people.get_by_label("Full name").fill("Yaw Sarpong")
    people.get_by_label("Phone number").fill("0245556666")
    people.get_by_text("Staff", exact=True).click()
    people.get_by_label("Temporary password").fill("temp-yaw-01")
    people.get_by_role("button", name="Add person").click()
    expect(page.get_by_text(re.compile("Yaw Sarpong added"))).to_be_visible()
    expect(people.get_by_text(re.compile("Staff · has not logged in yet"))).to_be_visible()
    shot(page, "p2-people.png")
    log_out(page, BASE)

    # Staff: first login, sees this business, cannot add people
    first_login(page, BASE, "0245556666", "temp-yaw-01", "yaw-pass-01")
    expect(page.get_by_text("Adom Books & Stationery").first).to_be_visible()
    page.goto(BASE + "/record/sale")
    page.get_by_label("How much did you receive? (GHS)").fill("50")
    page.get_by_role("button", name="Save sale").click()
    page.goto(BASE + "/settings")
    expect(page.get_by_text("Only the owner can add or remove people.")).to_be_visible()
    expect(page.get_by_role("button", name="Add a person")).to_have_count(0)
    expect(page.get_by_role("link", name=re.compile("MSME Pack admin"))).to_have_count(0)
    log_out(page, BASE)

    # Owner removes him; he can no longer get in
    page.get_by_label("Phone number").fill("0244560077")
    page.get_by_label("Password").fill("books-2026")
    page.get_by_role("button", name="Log in").click()
    expect(page.get_by_text("GHS 1,050.00").first).to_be_visible()
    page.goto(BASE + "/settings")
    people = page.locator("section", has=page.get_by_role("heading", name="People who use this business"))
    people.get_by_role("button", name="Remove").click()
    people.get_by_role("button", name="Remove").click()
    expect(page.get_by_text("Yaw Sarpong can no longer use the business.")).to_be_visible()
    log_out(page, BASE)
    page.get_by_label("Phone number").fill("0245556666")
    page.get_by_label("Password").fill("yaw-pass-01")
    page.get_by_role("button", name="Log in").click()
    expect(page.get_by_text(re.compile("You are not part of any business yet"))).to_be_visible()

    assert not errors, errors
    browser.close()
    print("PEOPLE E2E PASSED")
