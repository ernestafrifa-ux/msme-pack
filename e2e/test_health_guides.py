# Browser test of the business health check and the guides.
# Needs: pip install playwright && playwright install chromium
# Run against a FRESH database with the server on :4000:  python e2e/test_health_guides.py
import os
import re
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BASE_URL", "http://localhost:4000")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
os.makedirs(OUT, exist_ok=True)
errors = []


def shot(page, name):
    vp = page.viewport_size
    page.screenshot(path=f"{OUT}/{name}", full_page=True)
    page.set_viewport_size(vp)
    page.evaluate("document.activeElement && document.activeElement.blur()")
    page.wait_for_timeout(150)


def answer_current(page):
    """Money & records: weakest answer. Registration question: 'renewal is late'. Everything else: strongest."""
    area = page.locator(".area-chip").inner_text()
    question = page.locator(".hc-question").inner_text()
    options = page.locator(".hc-option")
    if area == "Money & records":
        options.nth(0).click()
    elif "Registrar of Companies" in question:
        options.nth(2).click()
    else:
        options.nth(3).click()
    expect(page.locator(".hc-option.option-on")).to_have_count(1)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(BASE + "/signup")
    page.get_by_label("Your full name").fill("Ama Mensah")
    page.get_by_label("Phone number").fill("0244440002")
    page.get_by_label("Choose a password").fill("shito-2026")
    page.get_by_role("button", name="Create account").click()
    page.get_by_label("Business name").fill("Ama's Shito & Spices")
    # Set up with a bank account too
    page.get_by_text("The business has a bank account").click()
    page.get_by_label("Bank name").fill("Ecobank")
    page.get_by_label("Balance today (GHS)").nth(1).fill("250")
    shot(page, "h0-setup-bank.png")
    page.get_by_role("button", name="Start keeping records").click()
    expect(page.locator(".money-account", has_text="Ecobank account")).to_contain_text("250.00")

    # Home invites the check
    page.get_by_role("link", name=re.compile("How healthy is your business")).click()
    expect(page.get_by_role("heading", name="How healthy is your business?")).to_be_visible()
    shot(page, "h1-health-intro.png")
    page.get_by_role("link", name="Start the health check").click()

    # Answer 5, leave, come back
    for n in range(1, 6):
        expect(page.locator(".topbar-title")).to_have_text(f"Question {n} of 18")
        answer_current(page)
        if n == 1:
            shot(page, "h2-question.png")
        page.get_by_role("button", name="Next").click()
    page.get_by_role("link", name="Close. Your answers are saved.").click()
    page.get_by_role("link", name="Continue (5 of 18 answered)").click()
    expect(page.locator(".topbar-title")).to_have_text("Question 6 of 18")

    # Back keeps the earlier answer
    page.get_by_role("button", name="Back").click()
    expect(page.locator(".hc-option.option-on")).to_have_count(1)
    page.get_by_role("button", name="Next").click()

    for n in range(6, 19):
        expect(page.locator(".topbar-title")).to_have_text(f"Question {n} of 18")
        answer_current(page)
        if n < 18:
            page.get_by_role("button", name="Next").click()
    page.get_by_role("button", name="See my result").click()

    # Result
    expect(page).to_have_url(BASE + "/health")
    expect(page.locator(".score-ring")).to_have_text("81")
    expect(page.locator(".score-word")).to_have_text("Good in places, one area needs work")
    expect(page.locator(".area-line", has_text="Money & records")).to_contain_text("0")
    expect(page.locator(".area-line", has_text="Registration & compliance")).to_contain_text("83")
    steps = page.locator(".steps-list .txn-title")
    expect(steps).to_have_count(4)
    expect(steps.nth(3)).to_have_text("Register your business and get your permits")
    shot(page, "h3-health-result.png")

    # Read the first recommended guide
    first_title = steps.nth(0).inner_text()
    steps.nth(0).click()
    expect(page.get_by_role("heading", level=1)).to_have_text(first_title)
    expect(page.get_by_text("Try it now")).to_be_visible()
    shot(page, "h4-guide.png")
    page.get_by_role("button", name="Mark as read").click()
    expect(page.get_by_role("button", name="Read. Tap to undo")).to_be_visible()

    # Learn: progress and remaining recommendations
    page.get_by_role("link", name="Back").click()
    expect(page).to_have_url(BASE + "/learn")
    expect(page.get_by_text("1 of 11 read")).to_be_visible()
    expect(page.locator(".steps-list .txn-title")).to_have_count(3)
    expect(page.locator(".steps-list")).not_to_contain_text(first_title)
    shot(page, "h5-learn.png")

    # The tax guide: note box and a literal asterisk in the USSD code
    page.get_by_role("link", name=re.compile("Tax basics for small businesses")).click()
    expect(page.locator(".md-note")).to_contain_text("Tax rules change")
    expect(page.get_by_text("*880#").first).to_be_visible()
    # Checklist boxes in another guide can be ticked
    page.goto(BASE + "/learn/separate-business-money")
    box = page.get_by_role("checkbox").first
    box.check()
    expect(box).to_be_checked()

    # Home shows the score and next step
    page.goto(BASE + "/")
    expect(page.locator(".health-card")).to_contain_text("Business health 81/100")
    expect(page.locator(".health-card")).to_contain_text("your next step")
    shot(page, "h6-home.png")

    overflow = {}
    page.set_viewport_size({"width": 320, "height": 640})
    for path in ["/", "/learn", "/health", "/health/check", "/learn/tax-basics", "/records"]:
        page.goto(BASE + path)
        page.wait_for_timeout(400)
        overflow[path] = page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
    page.goto(BASE + "/")
    page.wait_for_timeout(400)
    page.screenshot(path=f"{OUT}/h7-home-320.png")
    browser.close()

print("page errors:", errors)
print("horizontal overflow at 320px:", overflow)
assert not errors, errors
assert not any(overflow.values()), overflow
print("HEALTH AND GUIDES E2E PASSED")
