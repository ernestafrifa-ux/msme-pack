# Browser test: Adom Books & Stationery starts with only cash and MoMo, then opens a
# bank account and registers for VAT later through Registrations.
# Run against a FRESH database with the server on :4000:  python e2e/test_registrations.py
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


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page.on("pageerror", lambda e: errors.append(str(e)))

    onboard_to_setup(page, BASE, "Adwoa Mensah", "0244560077", "books-2026", "Adom Books & Stationery")
    page.get_by_label("Cash in the business box today (GHS)").fill("1000")
    expect(page.get_by_text(re.compile("No bank account yet\\? That is fine"))).to_be_visible()
    page.get_by_role("button", name="Start keeping records").click()
    expect(page.get_by_text("GHS 1,000.00")).to_be_visible()

    # A service on the product list
    page.goto(BASE + "/stock/new")
    page.get_by_role("button", name="Service", exact=True).click()
    page.get_by_label("Service name").fill("Photocopying")
    page.get_by_label(re.compile("^Selling price")).fill("1")
    page.get_by_role("button", name="Add service").click()
    expect(page.get_by_role("heading", name="Photocopying")).to_be_visible()

    # Settings → Registrations
    page.goto(BASE + "/settings")
    page.get_by_role("link", name=re.compile("^Registrations: bank account & VAT")).click()
    bank = page.locator("section", has=page.get_by_role("heading", name="Business bank account"))
    vat = page.locator("section", has=page.get_by_role("heading", name="VAT registration with GRA"))
    expect(bank.locator(".pill")).to_have_text("Not started")
    expect(vat.get_by_text(re.compile("Your products include Photocopying"))).to_be_visible()

    # VAT advice: goods only is far below the threshold; with services it must register
    vat.get_by_role("button", name="Goods", exact=True).click()
    expect(vat.get_by_text(re.compile("You do not need to register yet"))).to_be_visible()
    vat.get_by_role("button", name="Both", exact=True).click()
    expect(vat.get_by_text("Services must register.")).to_be_visible()

    # Bank: get ready, tick documents, then the account is open
    bank.get_by_role("button", name="Start getting ready").click()
    expect(bank.locator(".pill")).to_have_text("In progress")
    bank.get_by_text("Your Ghana Card", exact=True).click()
    bank.get_by_text(re.compile("^Two passport photos")).click()
    expect(bank.get_by_text("What to bring (2 of 6 ready)")).to_be_visible()
    shot(page, "g1-registrations-progress.png")
    page.reload()
    expect(bank.get_by_text("What to bring (2 of 6 ready)")).to_be_visible()
    bank.get_by_role("button", name="The account is open").click()
    bank.get_by_label("Bank name").fill("GCB")
    bank.get_by_label("Balance today (GHS)").fill("500")
    bank.get_by_role("button", name="Add the account").click()
    expect(page.get_by_text("GCB account added. Record bank deposits and payments from today.")).to_be_visible()
    expect(bank.locator(".pill")).to_have_text("Done")

    # VAT: get ready (the bank item is already ticked), then GRA has registered us
    vat.get_by_role("button", name="Start getting ready").click()
    expect(vat.get_by_text("What to bring (1 of 5 ready)")).to_be_visible()
    vat.get_by_role("button", name="GRA has registered us").click()
    vat.get_by_label("VAT number (as on the certificate)").fill("P0012345678")
    vat.get_by_role("button", name="Switch VAT on").click()
    expect(page.get_by_text("VAT switched on. New invoices add NHIL, GETFund and VAT.")).to_be_visible()
    expect(vat.get_by_text("P0012345678")).to_be_visible()
    shot(page, "g2-registrations-done.png")

    # Home shows the bank; a new invoice adds VAT
    page.goto(BASE + "/")
    expect(page.get_by_text("GHS 1,500.00").first).to_be_visible()
    page.goto(BASE + "/invoices/new")
    expect(page.get_by_label(re.compile("Add VAT, NHIL & GETFund"))).to_be_checked()

    assert not errors, errors
    browser.close()
    print("REGISTRATIONS E2E PASSED")
