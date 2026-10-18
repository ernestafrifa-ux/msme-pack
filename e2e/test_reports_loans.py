# Browser test of the reports, loans, supplier credit and equipment.
# Run against a FRESH database with the server on :4000:  python e2e/test_reports_loans.py
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

    # Sign up and set up: cash 1000
    onboard_to_setup(page, BASE, "Adwoa Mensah", "0244560001", "books-2026", "Adom Books")
    page.get_by_label("Cash in the business box today (GHS)").fill("1000")
    page.get_by_role("button", name="Start keeping records").click()
    expect(page.get_by_text("GHS 1,000.00")).to_be_visible()

    # A product: 50 exercise books at cost 10, selling 20
    page.goto(BASE + "/stock/new")
    page.get_by_label("Product name").fill("Exercise book")
    page.get_by_label(re.compile("^Cost price")).fill("10")
    page.get_by_label(re.compile("^Selling price")).fill("20")
    page.get_by_label("How many you have now").fill("50")
    page.get_by_role("button", name="Add product").click()
    expect(page.get_by_role("heading", name="Exercise book")).to_be_visible()

    # Sale: 5 books for cash (100)
    page.goto(BASE + "/record/sale")
    page.get_by_role("button", name="Add products").click()
    page.get_by_role("dialog").get_by_role("button", name=re.compile("Exercise book")).click()
    page.get_by_role("button", name="Done").click()
    page.get_by_label("Quantity of Exercise book").fill("5")
    page.get_by_role("button", name="Save sale").click()
    expect(page.get_by_text("GHS 1,100.00")).to_be_visible()

    # Buy 10 books on credit at 12 from Kejetia Wholesale: no money moves
    page.goto(BASE + "/record/purchase")
    page.get_by_role("button", name="Add products").click()
    page.get_by_role("dialog").get_by_role("button", name=re.compile("Exercise book")).click()
    page.get_by_role("button", name="Done").click()
    page.get_by_label("Quantity of Exercise book").fill("10")
    page.get_by_label("Cost of one Exercise book (GHS)").fill("12")
    page.get_by_text("Paid later (bought on credit)").click()
    expect(page.get_by_text("Where did the money come from?")).to_have_count(0)
    page.get_by_label("Who did you buy from?").fill("Kejetia Wholesale")
    shot(page, "r1-buy-on-credit.png")
    page.get_by_role("button", name="Save stock bought").click()
    expect(page.get_by_text("Stock bought on credit for GHS 120.00 saved. You owe Kejetia Wholesale.")).to_be_visible()
    expect(page.get_by_text("GHS 1,100.00")).to_be_visible()

    # Loans & equipment: a 500 microfinance loan into the cash box, repay 110 (10 interest), a photocopier for 300
    page.goto(BASE + "/records")
    page.get_by_role("link", name="Reports").click()
    page.get_by_role("link", name=re.compile("^Loans & equipment")).click()
    expect(page.get_by_text("GHS 120.00", exact=True)).to_be_visible()  # the supplier debt
    page.get_by_role("button", name="Add a loan or debt").click()
    page.get_by_label("Who lent you the money?").fill("Opportunity Microfinance")
    page.get_by_label("Amount borrowed (GHS)").fill("500")
    page.get_by_role("button", name="Save loan").click()
    expect(page.get_by_text("GHS 620.00", exact=True)).to_be_visible()
    page.get_by_role("link", name=re.compile("^Opportunity Microfinance")).click()
    page.get_by_label("Amount paid (GHS)").fill("110")
    page.get_by_label("Of which interest (GHS)").fill("10")
    page.get_by_role("button", name="Save payment").click()
    expect(page.get_by_text("Payment of GHS 110.00 saved.")).to_be_visible()
    expect(page.locator(".stat.neg")).to_have_text("400.00")
    shot(page, "r2-loan.png")
    page.get_by_role("link", name="Back").click()
    page.get_by_role("button", name="Add equipment").click()
    page.get_by_label("What is it?").fill("Photocopier")
    page.get_by_label("What you paid (GHS)").fill("300")
    page.get_by_label("Paid from").select_option(label="Cash box")
    page.get_by_role("button", name="Save equipment").click()
    expect(page.locator(".asset-row")).to_contain_text("Photocopier")
    page.get_by_role("button", name="Update value").click()
    page.get_by_label("What it is worth now (GHS)").fill("250")
    page.get_by_role("button", name="Save", exact=True).click()
    expect(page.locator(".asset-row .txn-amt")).to_have_text("250.00")
    shot(page, "r3-loans-equipment.png")

    # Home: 1000 + 100 + 500 − 110 − 300 = 1190
    page.goto(BASE + "/")
    expect(page.get_by_text("GHS 1,190.00")).to_be_visible()

    # Reports
    page.goto(BASE + "/reports")
    shot(page, "r4-reports.png")
    page.get_by_role("link", name=re.compile("^Profit & loss")).click()
    expect(page.get_by_role("heading", name="Profit and loss statement")).to_be_visible()
    table = page.locator(".statement-table")
    expect(table).to_contain_text("Loan interest")
    expect(page.locator(".statement-table .total")).to_contain_text("40.00")  # 100 − 50 − 10 interest
    shot(page, "r5-profit-loss.png")

    page.goto(BASE + "/reports/balance-sheet")
    expect(page.get_by_role("heading", name="Balance sheet")).to_be_visible()
    # Owns: cash 1190 + stock 55×12=660 + photocopier 250 = 2100. Owes: 400 + 120 = 520. Share: 1580
    expect(page.locator(".statement-table")).to_contain_text("2,100.00")
    expect(page.locator(".statement-table")).to_contain_text("520.00")
    expect(page.locator(".statement-table .total")).to_contain_text("1,580.00")
    shot(page, "r6-balance-sheet.png")

    page.goto(BASE + "/reports/stock")
    expect(page.locator(".stock-lines")).to_contain_text("Start 0 · in 60 · sold 5 · lost 0 · end 55 piece")
    expect(page.locator(".statement-table .total")).to_contain_text("660.00")
    shot(page, "r7-stock.png")

    page.goto(BASE + "/reports/sales-by-product")
    expect(page.locator(".statement-table .total")).to_contain_text("50.00")
    shot(page, "r8-sales.png")

    page.goto(BASE + "/reports/debtors")
    expect(page.get_by_text("Nobody owes you money. Well done.")).to_be_visible()

    page.goto(BASE + "/records/receipts-payments")
    expect(page.locator(".statement-table")).to_contain_text("Loans received")
    expect(page.locator(".statement-table .total")).to_contain_text("1,190.00")

    # Records show the new kinds; the credit purchase moved no money
    page.goto(BASE + "/records")
    expect(page.get_by_text(re.compile("Bought on credit from Kejetia Wholesale"))).to_be_visible()
    expect(page.get_by_text(re.compile("^Loan repayment"))).to_be_visible()

    # Add a bank account later in Settings: GCB with GHS 300
    page.goto(BASE + "/settings")
    page.get_by_role("button", name="Add a bank account or MoMo").click()
    page.get_by_label("Bank name").fill("GCB")
    page.get_by_label("Balance today (GHS)").fill("300")
    page.get_by_role("button", name="Add", exact=True).click()
    expect(page.get_by_text("GCB account added.", exact=False)).to_be_visible()
    shot(page, "r9-settings-accounts.png")
    page.goto(BASE + "/")
    expect(page.get_by_text("GHS 1,490.00")).to_be_visible()
    expect(page.locator(".money-account", has_text="GCB account")).to_contain_text("300.00")
    shot(page, "r10-home-bank.png")
    page.goto(BASE + "/record/expense")
    expect(page.get_by_label("GCB account")).to_be_visible()

    overflow = {}
    page.set_viewport_size({"width": 320, "height": 640})
    for path in ["/", "/settings", "/reports", "/reports/profit-loss", "/reports/balance-sheet", "/reports/stock", "/reports/debtors",
                 "/reports/sales-by-product", "/loans", "/record/purchase"]:
        page.goto(BASE + path)
        page.wait_for_timeout(400)
        overflow[path] = page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
    browser.close()

print("page errors:", errors)
print("horizontal overflow at 320px:", overflow)
assert not errors, errors
assert not any(overflow.values()), overflow
print("REPORTS AND LOANS E2E PASSED")
