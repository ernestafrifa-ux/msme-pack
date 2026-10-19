# Browser test: staff record and close the day; the owner sees who recorded what.
# Run against a FRESH database with the server on :4000:  python e2e/test_control.py
import os
import re
from playwright.sync_api import sync_playwright, expect
from common import onboard_to_setup, log_out, first_login

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
    page.on("dialog", lambda d: d.accept())

    onboard_to_setup(page, BASE, "Adwoa Mensah", "0244560077", "books-2026", "Adom Books & Stationery")
    page.get_by_label("Cash in the business box today (GHS)").fill("500")
    page.get_by_role("button", name="Start keeping records").click()
    expect(page.get_by_text("Close the day")).to_be_visible()

    page.goto(BASE + "/settings")
    people = page.locator("section", has=page.get_by_role("heading", name="People who use this business"))
    people.get_by_role("button", name="Add a person").click()
    people.get_by_label("Full name").fill("Yaw Sarpong")
    people.get_by_label("Phone number").fill("0245556666")
    people.get_by_label("Temporary password").fill("temp-yaw-01")
    people.get_by_role("button", name="Add person").click()
    expect(page.get_by_text(re.compile("Yaw Sarpong added"))).to_be_visible()
    log_out(page, BASE)

    # Yaw records two sales and closes the day 5 short
    first_login(page, BASE, "0245556666", "temp-yaw-01", "yaw-pass-01")
    for amount in ["80", "20"]:
        page.goto(BASE + "/record/sale")
        page.get_by_label(re.compile("How much did you receive")).fill(amount)
        page.get_by_role("button", name="Save sale").click()
        expect(page.get_by_text(re.compile("saved"))).to_be_visible()
    page.get_by_role("link", name=re.compile("Close the day")).click()
    expect(page.get_by_text("Records say GHS 600.00")).to_be_visible()
    page.get_by_label("Counted in Cash box (GHS)").fill("595")
    expect(page.get_by_text("Short by GHS 5.00")).to_be_visible()
    page.get_by_label("Note (optional)").fill("Counted at 6 pm")
    shot(page, "k1-close-day.png")
    page.get_by_role("button", name="Close the day").click()
    expect(page.get_by_text(re.compile("Cash box: short GHS 5.00"))).to_be_visible()
    expect(page.get_by_text("Day closed: cash counted today")).to_be_visible()
    page.goto(BASE + "/reports")
    expect(page.get_by_role("link", name=re.compile("Who recorded what"))).to_have_count(0)
    log_out(page, BASE)

    # Adwoa sees the activity and who recorded each sale
    login(page, "0244560077", "books-2026")
    expect(page.get_by_text("GHS 595.00").first).to_be_visible()
    page.goto(BASE + "/records")
    expect(page.get_by_text(re.compile("by Yaw")).first).to_be_visible()
    page.goto(BASE + "/reports")
    page.get_by_role("link", name=re.compile("Who recorded what")).click()
    expect(page.get_by_text(re.compile("2 sales worth GHS 100.00"))).to_be_visible()
    expect(page.get_by_text(re.compile("Cash box · Yaw Sarpong"))).to_be_visible()
    shot(page, "k2-activity.png")

    assert not errors, errors
    browser.close()
    print("CONTROL E2E PASSED")
