# Browser test: target and budget, a savings goal, and the price checker.
# Run against a FRESH database with the server on :4000:  python e2e/test_planning.py
import os
import re
from playwright.sync_api import sync_playwright, expect
from common import onboard_to_setup

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

    onboard_to_setup(page, BASE, "Adwoa Mensah", "0244560077", "books-2026", "Adom Books & Stationery")
    page.get_by_label("Cash in the business box today (GHS)").fill("1000")
    page.get_by_role("button", name="Start keeping records").click()
    expect(page.get_by_text("GHS 1,000.00").first).to_be_visible()

    page.goto(BASE + "/record/sale")
    page.get_by_label(re.compile("How much did you receive")).fill("1500")
    page.get_by_role("button", name="Save sale").click()
    expect(page.get_by_text(re.compile("saved"))).to_be_visible()
    page.goto(BASE + "/record/expense")
    page.get_by_label(re.compile("How much did you spend")).fill("400")
    page.get_by_label(re.compile("What was it for")).select_option(label="Rent")
    page.get_by_role("button", name="Save expense").click()
    expect(page.get_by_text(re.compile("saved"))).to_be_visible()

    # Target and budget
    page.goto(BASE + "/reports")
    page.get_by_role("link", name=re.compile("^Target & budget")).click()
    page.get_by_role("button", name="Set a target and budget").click()
    page.get_by_label("Sales target for the month (GHS)").fill("6000")
    page.get_by_label("Spending budget (GHS)").fill("1000")
    page.get_by_label("Limit for Rent").fill("400")
    page.get_by_role("button", name="Save plan").click()
    expect(page.get_by_text("GHS 1,500.00 of 6,000.00 (25%)")).to_be_visible()
    expect(page.get_by_text("GHS 400.00 of 400.00 (100%)")).to_be_visible()
    shot(page, "g3-plan.png")
    page.goto(BASE + "/")
    expect(page.get_by_text("GHS 1,500.00 of 6,000.00 (25%)")).to_be_visible()
    expect(page.get_by_text("GHS 400.00 of 1,000.00 (40%)")).to_be_visible()

    # A savings box and a goal
    page.goto(BASE + "/settings")
    page.get_by_role("button", name="Add a bank account or MoMo").click()
    page.get_by_label("Type").select_option("cash")
    page.get_by_label("Name", exact=True).fill("Savings box")
    page.get_by_role("button", name="Add", exact=True).click()
    expect(page.get_by_text(re.compile("Savings box added"))).to_be_visible()
    page.goto(BASE + "/goals")
    page.get_by_role("button", name="Add a goal").click()
    page.get_by_label("What are you saving for?").fill("New photocopier")
    page.get_by_label("Amount needed (GHS)").fill("3000")
    page.get_by_label("Saved in").select_option(label="Savings box")
    page.get_by_role("button", name="Save goal").click()
    expect(page.get_by_text("GHS 0.00 of 3,000.00 saved in Savings box (0%)")).to_be_visible()
    page.get_by_role("button", name="Put money aside").click()
    expect(page.get_by_label("To")).to_have_value(re.compile(".+"))
    expect(page.get_by_label("To").locator("option:checked")).to_have_text("Savings box")
    page.get_by_label("How much did you move? (GHS)").fill("750")
    page.get_by_role("button", name=re.compile("^Save")).first.click()
    page.goto(BASE + "/goals")
    expect(page.get_by_text("GHS 750.00 of 3,000.00 saved in Savings box (25%)")).to_be_visible()
    shot(page, "g4-goals.png")

    # Price checker with a product
    page.goto(BASE + "/stock/new")
    page.get_by_label("Product name").fill("Exercise book")
    page.get_by_label(re.compile("^Cost price")).fill("10")
    page.get_by_label("How many you have now").fill("20")
    page.get_by_role("button", name="Add product").click()
    expect(page.get_by_role("heading", name="Exercise book")).to_be_visible()
    page.goto(BASE + "/price-check")
    page.get_by_label("Product (optional)").select_option(label="Exercise book")
    page.get_by_label("Other costs per one (GHS)").fill("0.50")
    page.get_by_label("Margin you want (%)").fill("30")
    page.get_by_label("Monthly running costs (GHS, optional)").fill("900")
    expect(page.locator(".price-result")).to_contain_text("GHS 15.00")
    shot(page, "g5-price.png")
    page.get_by_role("button", name=re.compile("Use GHS 15.00 as Exercise book")).click()
    expect(page.get_by_text("Exercise book now sells at GHS 15.00.")).to_be_visible()

    assert not errors, errors
    browser.close()
    print("PLANNING E2E PASSED")
