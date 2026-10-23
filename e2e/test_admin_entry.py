# Browser test: an admin who also runs a business reaches the MSME Pack admin straight from Home
# (and from the left menu on a computer), not from Business details; and both backups download.
# Run against a FRESH database with the server on :4000:  python e2e/test_admin_entry.py
import os
import re
from playwright.sync_api import sync_playwright, expect
from common import create_admin, ADMIN_PHONE

BASE = os.environ.get("BASE_URL", "http://localhost:4000")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
os.makedirs(OUT, exist_ok=True)
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("dialog", lambda d: d.accept())

    create_admin(page, BASE)
    # The admin sets up their own business, with themselves as owner
    page.goto(BASE + "/admin/new")
    page.get_by_label("Business name").fill("Admin Test Shop")
    page.get_by_label("Owner’s full name").fill("MSME Pack Admin")
    page.get_by_label("Owner’s phone number").fill(ADMIN_PHONE)
    page.get_by_role("button", name="Set up the business").click()
    expect(page.get_by_text(re.compile("Admin Test Shop is set up"))).to_be_visible()
    page.goto(BASE + "/")
    page.get_by_label("Cash in the business box today (GHS)").fill("300")
    page.get_by_role("button", name="Start keeping records").click()
    expect(page.get_by_text("GHS 300.00").first).to_be_visible()

    # Phone: a card on Home
    entry = page.get_by_role("link", name=re.compile("^MSME Pack admin"))
    expect(entry).to_be_visible()
    page.screenshot(path=f"{OUT}/ae1-home-admin-entry.png")
    entry.click()
    expect(page).to_have_url(BASE + "/admin")
    expect(page.get_by_role("heading", name="1 business")).to_be_visible()
    page.get_by_role("link", name="Back").click()
    expect(page).to_have_url(BASE + "/")
    # No longer in Business details
    page.goto(BASE + "/settings")
    expect(page.get_by_role("link", name=re.compile("MSME Pack admin"))).to_have_count(0)

    # Backups: the owner's Excel backup in Business details, and the admin's full backup
    with page.expect_download() as d:
        page.get_by_role("button", name="Download backup").click()
    dl = d.value
    assert re.match(r"MSME-Pack-backup-Admin-Test-Shop-\d{4}-\d{2}-\d{2}\.xlsx$", dl.suggested_filename), dl.suggested_filename
    path = dl.path()
    assert os.path.getsize(path) > 3000
    expect(page.get_by_text(re.compile("Backup saved: MSME-Pack-backup-Admin-Test-Shop"))).to_be_visible()
    page.get_by_text(re.compile("^Backup$")).scroll_into_view_if_needed()
    page.screenshot(path=f"{OUT}/ae3-owner-backup.png", full_page=True)
    page.goto(BASE + "/admin")
    with page.expect_download() as d:
        page.get_by_role("button", name="Download full backup").click()
    assert d.value.suggested_filename.endswith(".json.gz"), d.value.suggested_filename
    expect(page.get_by_text(re.compile("Backup saved: MSME-Pack-full-backup"))).to_be_visible()
    page.screenshot(path=f"{OUT}/ae4-admin-backup.png")

    # Computer: in the left menu
    page.set_viewport_size({"width": 1366, "height": 860})
    page.goto(BASE + "/")
    side = page.locator("nav.side-nav")
    expect(side.get_by_role("link", name="MSME Pack admin")).to_be_visible()
    expect(page.locator(".admin-entry")).to_have_count(0)
    side.get_by_role("link", name="MSME Pack admin").click()
    expect(page).to_have_url(BASE + "/admin")
    expect(side.get_by_role("link", name="MSME Pack admin")).to_have_class(re.compile("active"))
    page.screenshot(path=f"{OUT}/ae2-desktop-admin.png")

    print("page errors:", errors)
    assert not errors, errors
    print("ADMIN ENTRY E2E PASSED")
    browser.close()
