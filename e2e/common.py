# Shared steps for the browser tests: sign-up is closed, so each test creates the admin
# (first account), the admin sets up the business and its owner, and the owner logs in.
import re
from playwright.sync_api import expect

ADMIN_PHONE = "0559990000"
ADMIN_PASSWORD = "admin-pass-1"


def create_admin(page, base):
    page.goto(base + "/login")
    page.get_by_role("link", name="Create the admin account").click()
    page.get_by_label("Your full name").fill("MSME Pack Admin")
    page.get_by_label("Phone number").fill(ADMIN_PHONE)
    page.get_by_label("Choose a password").fill(ADMIN_PASSWORD)
    page.get_by_role("button", name="Create account").click()
    expect(page.get_by_role("link", name=re.compile("New business"))).to_be_visible()


def admin_creates_business(page, base, business, owner, phone, temp, language="en",
                           sector=None, region=None, town=None, legal=None):
    page.goto(base + "/admin/new")
    page.get_by_label("Business name").fill(business)
    if sector:
        page.get_by_text(sector, exact=True).click()
    if region:
        page.get_by_label("Region").select_option(label=region)
    if town:
        page.get_by_label("Town").fill(town)
    if legal:
        page.get_by_text(legal).click()
    page.get_by_label("Owner’s full name").fill(owner)
    page.get_by_label("Owner’s phone number").fill(phone)
    page.get_by_label("Temporary password").fill(temp)
    page.get_by_label("Language they prefer").select_option(language)
    page.get_by_role("button", name="Set up the business").click()
    expect(page.get_by_text(re.compile(re.escape(business) + " is set up"))).to_be_visible()


def log_out(page, base):
    page.evaluate("localStorage.removeItem('msme.token')")
    page.goto(base + "/login")


def first_login(page, base, phone, temp, password):
    page.goto(base + "/login")
    page.get_by_label(re.compile("Phone number|Phone")).first.fill(phone)
    page.locator("input[type=password]").fill(temp)
    page.locator("form button.btn-primary").click()
    # English, or the Twi drafts for a user whose language is Twi
    heading = page.get_by_role("heading", name=re.compile("^(Choose your own password|Paw wo ankasa password)$"))
    expect(heading).to_be_visible()
    twi = heading.inner_text().startswith("Paw")
    page.get_by_label("Password a ɛyɛ bere tiaa mu dea" if twi else "Temporary password", exact=True).fill(temp)
    page.get_by_label("Password foforɔ" if twi else "New password", exact=True).fill(password)
    page.get_by_label("San kyerɛw password foforɔ no" if twi else "New password again", exact=True).fill(password)
    page.get_by_role("button", name="Sie password no" if twi else "Save password").click()


def onboard_to_setup(page, base, owner, phone, password, business, **kw):
    """Admin + business + owner's first login; ends on the owner's money setup screen."""
    create_admin(page, base)
    admin_creates_business(page, base, business, owner, phone, "temp-pass-1", **kw)
    log_out(page, base)
    first_login(page, base, phone, "temp-pass-1", password)
    expect(page).to_have_url(base + "/setup")
