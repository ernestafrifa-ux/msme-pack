# Browser test: the loan-ready pack, on screen and printed to PDF.
# Run against a FRESH database with the server on :4000:  python e2e/test_loan_pack.py
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
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page.on("pageerror", lambda e: errors.append(str(e)))

    onboard_to_setup(page, BASE, "Adwoa Mensah", "0244560077", "books-2026", "Adom Books & Stationery", region="Ashanti", town="Kumasi")
    page.get_by_label("Cash in the business box today (GHS)").fill("1000")
    page.get_by_role("button", name="Start keeping records").click()
    expect(page.get_by_text("GHS 1,000.00").first).to_be_visible()
    for kind, amount in [("sale", "2000"), ("expense", "500")]:
        page.goto(BASE + f"/record/{kind}")
        page.get_by_label(re.compile("How much did you")).fill(amount)
        page.get_by_role("button", name=re.compile(f"^Save {kind}")).click()
        expect(page.get_by_text(re.compile("saved"))).to_be_visible()

    page.goto(BASE + "/reports")
    page.get_by_role("link", name=re.compile("^Loan-ready pack")).click()
    pack = page.locator(".pack")
    expect(pack).to_contain_text("BUSINESS SUMMARY")
    expect(pack).to_contain_text("Adwoa Mensah")
    expect(pack).to_contain_text("Kumasi, Ashanti")
    expect(pack.locator(".pack-table").first).to_contain_text("2,000.00")
    expect(pack).to_contain_text("Owner’s signature")
    page.get_by_role("button", name="12 months").click()
    expect(pack.locator(".pack-table").first.locator("tbody tr")).to_have_count(2)  # one month of records + total
    expect(pack).to_contain_text("kept records here for 1 month")
    page.screenshot(path=f"{OUT}/l1-loan-pack.png", full_page=True)
    page.emulate_media(media="print")
    page.pdf(path=f"{OUT}/loan-pack.pdf", format="A4", print_background=True)
    assert os.path.getsize(f"{OUT}/loan-pack.pdf") > 10000

    assert not errors, errors
    browser.close()
    print("LOAN PACK E2E PASSED")
