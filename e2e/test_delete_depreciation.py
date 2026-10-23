# Browser test: equipment depreciation and the admin deleting a test business.
# The owner adds a sewing machine bought in March 2025 for GHS 2,400 with a 20% yearly rate:
# 10 months of 2025 take off GHS 400, so it is worth GHS 2,000 now, and GHS 480 comes off on
# 31 December. The balance sheet uses that value. Then the admin deletes the business (typing its
# name to confirm) and restores it.
# Run against a FRESH database with the server on :4000:  python e2e/test_delete_depreciation.py
import os
import re
from datetime import date
from playwright.sync_api import sync_playwright, expect
from common import onboard_to_setup, log_out, ADMIN_PHONE, ADMIN_PASSWORD

BASE = os.environ.get("BASE_URL", "http://localhost:4000")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
os.makedirs(OUT, exist_ok=True)
errors = []
assert date.today().year == 2026, "the expected values assume the test runs in 2026"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("dialog", lambda d: d.accept())

    onboard_to_setup(page, BASE, "Afia Asantewaa", "0241110051", "sew-2026-x", "Afia Couture")
    page.get_by_label("Cash in the business box today (GHS)").fill("1000")
    page.get_by_role("button", name="Start keeping records").click()
    expect(page.get_by_text("GHS 1,000.00").first).to_be_visible()

    # Equipment with depreciation
    page.goto(BASE + "/loans")
    page.get_by_role("button", name="Add equipment").click()
    page.get_by_label("What is it?").fill("Sewing machine")
    page.get_by_label("What you paid (GHS)").fill("2400")
    page.get_by_label("Date bought").fill("2025-03-10")
    expect(page.get_by_label("What it is worth now (GHS)")).to_be_visible()
    page.get_by_label("Depreciation rate (% a year, optional)").fill("20")
    expect(page.get_by_label("What it is worth now (GHS)")).to_have_count(0)
    page.screenshot(path=f"{OUT}/dd1-equipment-form.png", full_page=True)
    page.get_by_role("button", name="Save equipment").click()
    row = page.locator(".asset-row", has_text="Sewing machine")
    expect(row).to_contain_text("Loses 20% a year · 400.00 taken off so far · 480.00 more on 31 December")
    expect(row.locator(".txn-amt")).to_have_text("2,000.00")
    expect(row.get_by_role("button", name="Update value")).to_have_count(0)
    page.screenshot(path=f"{OUT}/dd2-equipment-row.png", full_page=True)

    # Change the rate to 10%: 200 off so far, worth 2,200
    row.get_by_role("button", name="Change rate").click()
    row.get_by_label("Depreciation rate (% a year)").fill("10")
    row.get_by_role("button", name="Save", exact=True).click()
    expect(row.locator(".txn-amt")).to_have_text("2,200.00")
    expect(row).to_contain_text("Loses 10% a year · 200.00 taken off so far · 240.00 more on 31 December")

    page.goto(BASE + "/reports/balance-sheet")
    expect(page.locator("tr", has_text="Sewing machine")).to_contain_text("2,200.00")
    expect(page.get_by_text(re.compile("Equipment is valued at what you paid less depreciation"))).to_be_visible()

    # Profit and loss for 2025 shows the year-end charge (10 months at 10% = 200)
    page.goto(BASE + "/reports/profit-loss")
    page.get_by_role("button", name=re.compile("Choose dates")).click()
    page.get_by_label("From").fill("2025-01-01")
    page.get_by_label("To").fill("2025-12-31")
    expect(page.locator("tr", has_text="Equipment depreciation")).to_contain_text("200.00")
    page.screenshot(path=f"{OUT}/dd3-pl-depreciation.png", full_page=True)
    log_out(page, BASE)

    # The admin deletes the business
    page.goto(BASE + "/login")
    page.get_by_label(re.compile("Phone number|Phone")).first.fill(ADMIN_PHONE)
    page.locator("input[type=password]").fill(ADMIN_PASSWORD)
    page.locator("form button.btn-primary").click()
    expect(page.get_by_role("heading", name="1 business")).to_be_visible()
    biz = page.locator(".biz-row", has_text="Afia Couture")
    biz.get_by_role("button", name="Delete business").click()
    expect(biz.get_by_role("button", name="Delete", exact=True)).to_be_disabled()
    biz.get_by_label("Type the business name to confirm").fill("Afia")
    biz.get_by_role("button", name="Delete", exact=True).click()
    expect(biz.get_by_text("Type Afia Couture exactly.")).to_be_visible()
    biz.get_by_label("Type the business name to confirm").fill("afia couture")
    page.screenshot(path=f"{OUT}/dd4-admin-delete.png", full_page=True)
    biz.get_by_role("button", name="Delete", exact=True).click()
    expect(page.get_by_text("Afia Couture deleted. You can restore it from Deleted businesses below.")).to_be_visible()
    expect(page.get_by_role("heading", name="0 businesses")).to_be_visible()
    page.get_by_text("Deleted businesses (1)").click()
    deleted = page.locator(".deleted-biz .biz-row", has_text="Afia Couture")
    expect(deleted).to_contain_text("Owner: Afia Asantewaa")
    expect(deleted).to_contain_text("by MSME Pack Admin")
    page.screenshot(path=f"{OUT}/dd5-admin-deleted.png", full_page=True)

    # The owner can no longer open it
    log_out(page, BASE)
    page.goto(BASE + "/login")
    page.get_by_label(re.compile("Phone number|Phone")).first.fill("0241110051")
    page.locator("input[type=password]").fill("sew-2026-x")
    page.locator("form button.btn-primary").click()
    expect(page.get_by_text("Afia Couture")).to_have_count(0)
    expect(page.get_by_text("GHS 1,000.00")).to_have_count(0)
    log_out(page, BASE)

    # Restore
    page.goto(BASE + "/login")
    page.get_by_label(re.compile("Phone number|Phone")).first.fill(ADMIN_PHONE)
    page.locator("input[type=password]").fill(ADMIN_PASSWORD)
    page.locator("form button.btn-primary").click()
    page.get_by_text("Deleted businesses (1)").click()
    page.locator(".deleted-biz .biz-row", has_text="Afia Couture").get_by_role("button", name="Restore").click()
    expect(page.get_by_text("Afia Couture restored.")).to_be_visible()
    expect(page.get_by_role("heading", name="1 business")).to_be_visible()
    expect(page.get_by_text(re.compile("^Deleted businesses"))).to_have_count(0)

    print("page errors:", errors)
    assert not errors, errors
    print("DELETE AND DEPRECIATION E2E PASSED")
    browser.close()
