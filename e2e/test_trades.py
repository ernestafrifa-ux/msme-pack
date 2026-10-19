# Browser test: trades that use products in their work.
# A hair salon keeps relaxer as an item "used in work", sells braiding, records the relaxer used,
# and sees it in the profit and loss as a cost of sales (not a loss). A bakery makes bread
# from flour in stock and sees what each loaf cost to make.
# Run against a FRESH database with the server on :4000:  python e2e/test_trades.py
import os
import re
from playwright.sync_api import sync_playwright, expect
from common import onboard_to_setup, log_out, admin_creates_business, first_login, ADMIN_PHONE, ADMIN_PASSWORD

BASE = os.environ.get("BASE_URL", "http://localhost:4000")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
os.makedirs(OUT, exist_ok=True)
errors = []


def shot(page, name):
    vp = page.viewport_size
    page.screenshot(path=f"{OUT}/{name}", full_page=True)
    page.set_viewport_size(vp)
    page.wait_for_timeout(150)


def start(page, owner, phone, password, business, first=True):
    if first:
        onboard_to_setup(page, BASE, owner, phone, password, business)
    else:
        # The admin is already there: log in as admin, set up the next business, hand over.
        page.goto(BASE + "/login")
        page.get_by_label(re.compile("Phone number|Phone")).first.fill(ADMIN_PHONE)
        page.locator("input[type=password]").fill(ADMIN_PASSWORD)
        page.locator("form button.btn-primary").click()
        expect(page.get_by_role("link", name=re.compile("New business"))).to_be_visible()
        admin_creates_business(page, BASE, business, owner, phone, "temp-pass-1")
        log_out(page, BASE)
        first_login(page, BASE, phone, "temp-pass-1", password)
        expect(page).to_have_url(BASE + "/setup")
    page.get_by_label("Cash in the business box today (GHS)").fill("2000")
    page.get_by_role("button", name="Start keeping records").click()
    expect(page.get_by_text("GHS 2,000.00").first).to_be_visible()


def add_item(page, kind, name, unit, cost, have, price=None):
    page.goto(BASE + "/stock/new")
    page.get_by_role("button", name=kind, exact=True).click()
    page.get_by_label(re.compile("^(Product|Service|Item) name$")).fill(name)
    if unit:
        page.get_by_label("Counted in").select_option(unit)
    if cost is not None:
        page.get_by_label("Cost price (GHS)").fill(cost)
    if price is not None:
        page.get_by_label("Selling price (GHS)").fill(price)
    if have is not None:
        page.get_by_label("How many you have now").fill(have)
    page.get_by_role("button", name=re.compile("^Add (product|service|supply)$")).click()
    expect(page.get_by_text(f"{name} added.")).to_be_visible()


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("dialog", lambda d: d.accept())

    # --- Hair salon -------------------------------------------------------------------
    start(page, "Akosua Boateng", "0241110001", "salon-2026", "Glamour Touch Salon")
    page.goto(BASE + "/stock/new")
    page.get_by_role("button", name="Used in work", exact=True).click()
    expect(page.get_by_text(re.compile("Bought and used in your work, not sold"))).to_be_visible()
    expect(page.get_by_label("Selling price (GHS)")).to_have_count(0)
    shot(page, "tr1-supply-form.png")
    add_item(page, "Used in work", "Relaxer", "tub", "45", "10")
    expect(page.get_by_text(re.compile("Kept for use in your work, not for sale"))).to_be_visible()
    add_item(page, "Service", "Braiding", None, None, None, price="150")

    # A supply is not offered on a sale
    page.goto(BASE + "/record/sale")
    page.get_by_role("button", name="Add products").click()
    dialog = page.get_by_role("dialog", name="Choose a product")
    expect(dialog.get_by_role("button", name=re.compile("Braiding"))).to_be_visible()
    expect(dialog.get_by_role("button", name=re.compile("Relaxer"))).to_have_count(0)
    dialog.get_by_role("button", name=re.compile("Braiding")).click()
    page.get_by_role("button", name="Done").click()
    page.get_by_role("button", name="One more Braiding").click()
    page.get_by_text("Cash box", exact=True).click()
    page.get_by_role("button", name="Save sale").click()
    expect(page.get_by_text("Sale of GHS 300.00 saved.")).to_be_visible()

    # Relaxer used on clients
    page.goto(BASE + "/stock")
    expect(page.locator(".product-row", has_text="Relaxer").get_by_text("Used in work")).to_be_visible()
    page.locator(".product-row", has_text="Relaxer").click()
    page.get_by_role("button", name="Used in work").click()
    expect(page.get_by_text(re.compile("Its cost counts as a cost of your sales, not a loss"))).to_be_visible()
    page.get_by_label("How many tub").fill("2")
    page.get_by_role("button", name="Save", exact=True).click()
    expect(page.get_by_text("Used in the work: 2 tub recorded.")).to_be_visible()
    expect(page.locator(".money-total")).to_have_text("8 tub")

    page.goto(BASE + "/reports/profit-loss")
    expect(page.get_by_text("Less: products used in the work")).to_be_visible()
    expect(page.get_by_text("(90.00)")).to_be_visible()
    expect(page.get_by_text("Damaged or missing stock")).to_have_count(0)
    shot(page, "tr2-salon-pl.png")

    # Statement of cash flows: the salon's money, by trading, equipment and owner
    page.goto(BASE + "/reports")
    page.get_by_role("link", name=re.compile("^Cash flow")).click()
    expect(page.get_by_role("heading", name="Statement of cash flows")).to_be_visible()
    expect(page.locator("tr", has_text="Net cash from trading")).to_contain_text("300.00")
    expect(page.locator("tr", has_text="Money at the end")).to_contain_text("2,300.00")
    shot(page, "tr2b-salon-cashflow.png")
    log_out(page, BASE)

    # --- Bakery ------------------------------------------------------------------------
    start(page, "Efua Mensah", "0241110003", "bake-2026", "Sweet Crumbs Bakery", first=False)
    add_item(page, "Used in work", "Flour", "kg", "13", "50")
    add_item(page, "Used in work", "Sugar", "kg", "12", "10")
    add_item(page, "For sale", "Bread", None, "0", "0", price="15")
    page.get_by_role("button", name="Made some").click()
    page.get_by_label("How many piece made").fill("40")
    page.get_by_label("Ingredient 1", exact=True).select_option(label="Flour (50 kg)")
    page.get_by_label("How much of ingredient 1").fill("20")
    page.get_by_role("button", name="+ Add another").click()
    page.get_by_label("Ingredient 2", exact=True).select_option(label="Sugar (10 kg)")
    page.get_by_label("How much of ingredient 2").fill("2")
    expect(page.get_by_text("GHS 284.00 · GHS 7.10 each")).to_be_visible()
    shot(page, "tr3-make-form.png")
    page.get_by_role("button", name="Save", exact=True).click()
    expect(page.get_by_text("40 piece made. They cost GHS 7.10 each to make (GHS 284.00 in all).")).to_be_visible()
    expect(page.locator(".money-total")).to_have_text("40 piece")

    page.goto(BASE + "/stock")
    flour = page.locator(".product-row", has_text="Flour")
    expect(flour.locator(".txn-amt")).to_have_text("30")

    print("page errors:", errors)
    assert not errors, errors
    print("TRADES E2E PASSED")
    browser.close()
