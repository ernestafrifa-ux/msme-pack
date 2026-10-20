# Browser test: computer view. On a wide screen the app uses the computer view by itself
# (menu down the left, Home in two columns). It can be switched to phone view and back,
# in Settings → Screen layout, and the choice is kept on that device after a reload.
# Run against a FRESH database with the server on :4000:  python e2e/test_desktop.py
import os
import re
from playwright.sync_api import sync_playwright, expect
from common import onboard_to_setup

BASE = os.environ.get("BASE_URL", "http://localhost:4000")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
os.makedirs(OUT, exist_ok=True)
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1366, "height": 860})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("dialog", lambda d: d.accept())

    onboard_to_setup(page, BASE, "Yaw Darko", "0241110021", "desk-2026", "Darko Hardware")
    page.get_by_label("Cash in the business box today (GHS)").fill("1500")
    page.get_by_role("button", name="Start keeping records").click()
    expect(page.get_by_text("GHS 1,500.00").first).to_be_visible()

    side = page.locator("nav.side-nav")
    bottom = page.locator("nav.bottom-nav")
    # Wide screen: computer view by itself
    expect(side).to_be_visible()
    expect(bottom).to_be_hidden()
    expect(page.locator(".home-cols")).to_be_visible()
    cols = page.locator(".home-col")
    a, b = cols.nth(0).bounding_box(), cols.nth(1).bounding_box()
    assert b["x"] > a["x"] + a["width"] - 1, "Home shows two columns side by side"
    page.wait_for_timeout(300)
    page.screenshot(path=f"{OUT}/dk1-home.png")

    # The menu stays on inner screens too
    side.get_by_role("link", name="Reports").click()
    expect(page).to_have_url(BASE + "/reports")
    expect(side).to_be_visible()
    expect(side.get_by_role("link", name="Reports")).to_have_class(re.compile("active"))
    side.get_by_role("link", name="Record a sale").click()
    expect(page).to_have_url(BASE + "/record/sale")
    expect(page.get_by_text("Cash box", exact=True)).to_be_visible()
    page.screenshot(path=f"{OUT}/dk2-record.png")
    side.get_by_role("link", name="Stock").click()
    expect(page).to_have_url(BASE + "/stock")

    # Switch to phone view from the menu
    side.get_by_role("button", name="Switch to phone view").click()
    expect(side).to_have_count(0)
    expect(bottom).to_be_visible()
    page.goto(BASE + "/")
    expect(page.locator(".home-cols")).to_have_count(0)
    expect(bottom).to_be_visible()

    # Back to computer view in Settings; kept after a reload
    page.goto(BASE + "/settings")
    expect(page.get_by_role("radio", name=re.compile("^Phone view"))).to_be_checked()
    page.get_by_role("radio", name=re.compile("^Computer view")).check()
    expect(page.locator("nav.side-nav")).to_be_visible()
    page.screenshot(path=f"{OUT}/dk3-settings.png", full_page=True)
    page.reload()
    expect(page.locator("nav.side-nav")).to_be_visible()
    expect(page.get_by_role("radio", name=re.compile("^Computer view"))).to_be_checked()

    # Automatic on a phone-sized window: phone view
    page.get_by_role("radio", name=re.compile("^Automatic")).check()
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(BASE + "/")
    expect(page.locator("nav.side-nav")).to_have_count(0)
    expect(page.locator("nav.bottom-nav")).to_be_visible()
    expect(page.get_by_role("button", name="Log out")).to_be_visible()
    # ...and computer view again when the window is made wide
    page.set_viewport_size({"width": 1280, "height": 800})
    expect(page.locator("nav.side-nav")).to_be_visible()

    print("page errors:", errors)
    assert not errors, errors
    print("DESKTOP E2E PASSED")
    browser.close()
