# Browser test: SMS options when a provider is set up. Start the server with SMS_PROVIDER=log
# (nothing is really sent):  SMS_PROVIDER=log python e2e/test_sms.py
import os
import re
from playwright.sync_api import sync_playwright, expect
from common import create_admin

BASE = os.environ.get("BASE_URL", "http://localhost:4000")
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.on("pageerror", lambda e: errors.append(str(e)))

    create_admin(page, BASE)
    expect(page.get_by_text(re.compile("Text messages \\(SMS\\): on \\(log\\)"))).to_be_visible()
    page.goto(BASE + "/admin/new")
    page.get_by_label("Business name").fill("Adom Books & Stationery")
    page.get_by_label("Owner’s full name").fill("Adwoa Mensah")
    page.get_by_label("Owner’s phone number").fill("0244560077")
    page.get_by_label("Temporary password").fill("temp-pass-1")
    expect(page.get_by_label("Send the owner the login details by SMS")).to_be_checked()
    page.get_by_role("button", name="Set up the business").click()
    expect(page.get_by_text("Adom Books & Stationery is set up. Adwoa Mensah was sent the login details by SMS.")).to_be_visible()

    page.goto(BASE + "/admin/notices")
    page.get_by_label("Title").fill("Training on Friday")
    page.get_by_label("Message", exact=True).fill("At the GEA office, 10 am.")
    page.get_by_text("Also send a text message (SMS) to each business owner").click()
    expect(page.get_by_text(re.compile("This reaches 1 business"))).to_be_visible()
    page.get_by_role("button", name="Send message").click()
    expect(page.get_by_text(re.compile("SMS: 1 sent"))).to_be_visible()
    page.goto(BASE + "/admin")
    expect(page.get_by_text(re.compile("2 sent this month"))).to_be_visible()

    assert not errors, errors
    browser.close()
    print("SMS E2E PASSED")
