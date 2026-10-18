# Browser test of VAT on invoices, withholding tax on payments, the Tax screen and calculator.
# Run against a FRESH database with the server on :4000:  python e2e/test_vat_wht.py
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
    page.on("dialog", lambda d: d.accept())

    onboard_to_setup(page, BASE, "Ama Owusu", "0244111222", "print-2026", "Owusu Print House")
    page.get_by_label("Cash in the business box today (GHS)").fill("1000")
    page.get_by_role("button", name="Start keeping records").click()
    expect(page.get_by_text("GHS 1,000.00")).to_be_visible()

    # Settings: registered for VAT
    page.goto(BASE + "/settings")
    page.get_by_text("The business is registered for VAT with GRA").click()
    page.get_by_role("button", name="Save", exact=True).click()
    expect(page.get_by_text("Saved. New and existing invoices show these details.")).to_be_visible()

    # Invoice: banner printing 2,500 before tax, VAT on by default
    page.goto(BASE + "/invoices/new")
    page.get_by_label("Name").fill("Kumasi Metro Assembly")
    page.get_by_role("button", name="Other item").click()
    page.get_by_label("Description of item 1").fill("Banner printing")
    page.get_by_label("Price of one Banner printing (GHS)").fill("2500")
    expect(page.get_by_label(re.compile("Add VAT, NHIL & GETFund"))).to_be_checked()
    expect(page.locator(".totals")).to_contain_text("NHIL (2.5%)")
    expect(page.locator(".totals")).to_contain_text("375.00")
    expect(page.locator(".totals-grand")).to_contain_text("GHS 3,000.00")
    shot(page, "v1-invoice-vat.png")
    page.get_by_role("button", name="Save as draft").click()
    expect(page.get_by_text("Draft saved.")).to_be_visible()
    expect(page.locator(".paper-totals")).to_contain_text("GETFund (2.5%)")
    expect(page.locator(".paper-totals")).to_contain_text("VAT (15%)")
    page.get_by_role("button", name="I gave it another way (mark as sent)").click()

    # Payment: customer withholds 7.5% on services
    page.get_by_role("button", name="Record money received").click()
    page.get_by_text("The customer kept back withholding tax").click()
    page.get_by_role("button", name="Services 7.5%: 187.50").click()
    expect(page.get_by_label(re.compile("Amount \\(GHS\\)"))).to_have_value("2812.50")
    page.get_by_text("Cash box", exact=True).click()
    shot(page, "v2-payment-wht.png")
    page.get_by_role("button", name="Save payment").click()
    expect(page.get_by_text("Payment saved. This invoice is fully paid.")).to_be_visible()
    expect(page.get_by_text("Tax withheld by customer")).to_be_visible()

    page.goto(BASE + "/")
    expect(page.get_by_text("GHS 3,812.50").first).to_be_visible()

    # Tax screen
    page.goto(BASE + "/reports")
    page.get_by_role("link", name=re.compile("^Tax: VAT & withholding")).click()
    expect(page.locator("tr.total")).to_contain_text("500.00")
    expect(page.locator("#wht-head").locator("..")).to_contain_text("Kumasi Metro Assembly")
    # Calculator, from the sheet: 3,600 with tax, services
    page.get_by_label("Amount (GHS)").fill("3600")
    calc = page.locator("section", has=page.get_by_role("heading", name="Tax calculator"))
    expect(calc).to_contain_text("3,000.00")
    expect(calc).to_contain_text("225.00")
    expect(calc).to_contain_text("2,775.00")
    shot(page, "v3-tax-screen.png")
    page.get_by_role("button", name="Record a payment to GRA").click()
    expect(page.get_by_label("Amount paid (GHS)")).to_have_value("500.00")
    page.get_by_role("button", name="Save payment").click()
    expect(page.get_by_text("Payment of GHS 500.00 to GRA saved.")).to_be_visible()
    expect(page.locator("tr.total")).to_contain_text("0.00")

    # Statements
    page.goto(BASE + "/reports/profit-loss")
    expect(page.locator("tr.subtotal").first).to_contain_text("2,500.00")
    expect(page.get_by_text(re.compile("GHS 500.00 of the money received was VAT"))).to_be_visible()
    page.goto(BASE + "/reports/balance-sheet")
    expect(page.get_by_text("Tax withheld by customers (credit against income tax)")).to_be_visible()
    expect(page.locator("tr.total")).to_contain_text("3,500.00")
    shot(page, "v4-balance-sheet.png")
    page.goto(BASE + "/records/receipts-payments")
    expect(page.get_by_text("VAT, NHIL & GETFund paid to GRA")).to_be_visible()

    page.goto(BASE + "/learn/tax-basics")
    expect(page.get_by_text("Withholding tax (WHT)")).to_be_visible()

    assert not errors, errors
    browser.close()
    print("VAT and WHT flow OK")
