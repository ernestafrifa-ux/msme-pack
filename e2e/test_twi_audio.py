# Browser test of the reviewed Twi interface, Twi guides and guide audio.
# Needs: pip install playwright && playwright install chromium
# Run against a FRESH database with the server on :4000:
#   python e2e/test_twi_audio.py
# It makes the test user a content admin with: npm run make-admin (in server/).
import os
import re
import struct
import subprocess
import wave
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BASE_URL", "http://localhost:4000")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "screenshots")
os.makedirs(OUT, exist_ok=True)
errors = []
PHONE = "0244440003"


def shot(page, name):
    vp = page.viewport_size
    page.screenshot(path=f"{OUT}/{name}", full_page=True)
    page.set_viewport_size(vp)
    page.evaluate("document.activeElement && document.activeElement.blur()")
    page.wait_for_timeout(150)


def make_wav(path, seconds=1.0):
    rate = 8000
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", 0) for _ in range(int(rate * seconds))))


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, permissions=["microphone"])
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))

    # --- Twi before logging in --------------------------------------------------
    page.goto(BASE + "/login")
    page.get_by_role("button", name="Twi", exact=True).click()
    expect(page.get_by_role("heading", name="Akwaaba bio")).to_be_visible()
    expect(page.locator("html")).to_have_attribute("lang", "tw")
    page.get_by_role("link", name="Bue account").click()
    expect(page.get_by_role("heading", name="Bue w'account")).to_be_visible()
    expect(page.get_by_label("Kasa a wopɛ")).to_have_value("tw")
    page.get_by_label("Wo din nyinaa").fill("Ama Mensah")
    page.get_by_label("Phone number").fill(PHONE)
    page.get_by_label("Paw password").fill("shito-2026")
    shot(page, "t1-signup-twi.png")
    page.get_by_role("button", name="Bue account").click()

    expect(page.get_by_role("heading", name="Ka w'adwuma ho asɛm kyerɛ yɛn")).to_be_visible()
    page.get_by_label("Adwuma no din").fill("Ama's Shito & Spices")
    page.get_by_label("Sika a ɛwɔ adwuma adaka no mu nnɛ (GHS)").fill("100")
    page.get_by_role("button", name="Fi ase kyerɛw akontaa").click()

    # --- Home in Twi (reviewed: no draft banner, Twi month name) --------------------
    expect(page.locator(".money-label").first).to_have_text("Sika a wowɔ seesei")
    expect(page.get_by_role("note")).to_have_count(0)
    twi_months = ["Ɔpɛpɔn", "Ɔgyefoɔ", "Ɔbɛnem", "Oforisuo", "Kotonimma", "Ayɛwohomumɔ", "Kitawonsa", "Ɔsanaa", "Ɛbɔ", "Ahinime", "Obubuo", "Ɔpɛnimma"]
    month_now = page.evaluate("Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Accra', month: 'numeric' }).format(new Date()))")
    expect(page.get_by_text(twi_months[month_now - 1], exact=True)).to_be_visible()
    nav = page.get_by_role("navigation", name="Akwan titiriw")
    for label in ["Fie", "Akontaa", "Kyerɛw", "Nneɛma", "Invoice", "Sua"]:
        expect(nav.get_by_role("link", name=label, exact=True)).to_be_visible()
    shot(page, "t2-home-twi.png")

    # --- Record a sale in Twi ---------------------------------------------------------
    nav.get_by_role("link", name="Kyerɛw", exact=True).click()
    expect(page.get_by_role("tab", name="Adetɔn")).to_have_attribute("aria-selected", "true")
    expect(page.get_by_role("tab", name="Sika a akɔ baabi foforɔ")).to_be_visible()
    page.get_by_label("Sika ahe na wonyaeɛ? (GHS)").fill("50")
    shot(page, "t3-record-twi.png")
    page.get_by_role("button", name="Sie adetɔn no").click()
    expect(page.get_by_text("Adetɔn a woasie GHS 50.00.")).to_be_visible()
    # Owner pay in Twi
    page.get_by_role("navigation", name="Akwan titiriw").get_by_role("link", name="Kyerɛw", exact=True).click()
    page.get_by_role("tab", name="Wo ho akatua").click()
    page.get_by_label("Sika ahe na wofaa maa wo ho? (GHS)").fill("20")
    page.get_by_role("button", name="Sie wo ho akatua no").click()
    expect(page.get_by_text("W'akatua a woasie GHS 20.00.")).to_be_visible()
    expect(page.get_by_text("Wo tua wo ho ka bosome yi: GHS 20.00.")).to_be_visible()
    nav = page.get_by_role("navigation", name="Akwan titiriw")
    nav.get_by_role("link", name="Akontaa", exact=True).click()
    expect(page.get_by_role("heading", name="Nnɛ")).to_be_visible()
    expect(page.locator(".txn .small", has_text="Adetɔn")).to_have_count(1)
    expect(page.locator(".txn .small", has_text="Wo ho akatua")).to_have_count(1)

    # --- Twi guides (all three reviewed) -----------------------------------------------
    page.get_by_role("navigation", name="Akwan titiriw").get_by_role("link", name="Sua", exact=True).click()
    twi_title = "Ɛnka adwuma sika ne fie sika mu"
    row = page.locator(".product-row", has_text=twi_title)
    expect(row.locator(".draft-tag")).to_have_count(0)  # reviewed and approved
    expect(page.locator(".product-row", has_text="Kyerɛw wo akontaa da biara").locator(".draft-tag")).to_have_count(0)  # approved in round 2
    expect(page.get_by_text("Tax basics for small businesses")).to_be_visible()  # not translated yet: English
    shot(page, "t4-learn-twi.png")
    row.click()
    expect(page.get_by_role("heading", level=1)).to_have_text(twi_title)
    expect(page.locator(".draft-box")).to_have_count(0)
    expect(page.locator(".md")).to_contain_text("Wo ho akatua")
    page.get_by_role("button", name="Kyerɛ Borɔfo deɛ no").click()
    expect(page.get_by_role("region", name="Borɔfo deɛ no")).to_contain_text("Separate business and personal money")
    page.get_by_role("button", name="Fa Borɔfo deɛ no sie").click()
    expect(page.get_by_role("link", name="Kyerɛw nnɛ adetɔn")).to_be_visible()

    # --- Content admin: upload Twi audio -------------------------------------------------
    server = os.path.join(HERE, "..", "server")
    subprocess.run(["npm", "run", "make-admin", "--silent", "--", PHONE], cwd=server, check=True, capture_output=True)
    page.reload()
    admin = page.get_by_role("region", name="Audio (content admin)")
    expect(admin).to_be_visible()
    expect(admin.get_by_label("Recording language")).to_have_value("tw")
    expect(admin.get_by_text("No recording in this language yet.")).to_be_visible()

    wav_path = os.path.join(OUT, "test-tone.wav")
    make_wav(wav_path)
    admin.locator("input[type=file]").set_input_files(wav_path)
    expect(admin.get_by_text("Recording saved as a draft.")).to_be_visible()
    player = page.locator(".guide-audio-box")
    expect(player).to_contain_text("Tie wɔ Twi mu")
    expect(player.locator(".draft-tag")).to_be_visible()
    src = player.locator("audio").get_attribute("src")
    assert re.match(r"^/media/audio/separate-business-money-tw-[0-9a-f]+\.wav$", src), src
    status = page.evaluate("async (u) => (await fetch(u, { headers: { Range: 'bytes=0-15' } })).status", src)
    assert status == 206, status

    admin.get_by_role("button", name="Mark as reviewed").click()
    expect(player.locator(".draft-tag")).to_have_count(0)

    # Record in the browser (fake microphone), preview, then save it as the English recording.
    admin.get_by_label("Recording language").select_option("en")
    admin.get_by_role("button", name="Record now").click()
    page.wait_for_timeout(2200)
    admin.get_by_role("button", name=re.compile("^Stop")).click()
    expect(admin.get_by_text("Listen before saving")).to_be_visible()
    shot(page, "t5-audio-admin.png")
    admin.get_by_role("button", name="Save this recording").click()
    expect(admin.get_by_text("Recording saved as a draft.")).to_be_visible()
    expect(admin.get_by_label("Recording language").locator("option[value=en]")).to_contain_text("✓")
    # A Twi reader still hears Twi first.
    expect(player).to_contain_text("Tie wɔ Twi mu")

    # --- Switch language in settings; the choice is saved to the account ----------------
    page.goto(BASE + "/settings")
    page.get_by_label("English").check()
    expect(page.get_by_text("Language changed.")).to_be_visible()
    page.goto(BASE + "/")
    expect(page.get_by_role("navigation", name="Main").get_by_role("link", name="Home", exact=True)).to_be_visible()
    expect(page.get_by_role("note")).to_have_count(0)
    page.goto(BASE + "/learn/separate-business-money")
    expect(page.get_by_role("heading", level=1)).to_have_text("Separate business and personal money")
    expect(page.locator(".guide-audio-box")).to_contain_text("Listen in English")

    page.goto(BASE + "/settings")
    page.get_by_label("Twi", exact=True).check()
    expect(page.get_by_text("Woasesa kasa no.")).to_be_visible()
    page.reload()
    expect(page.get_by_role("heading", name="App kasa")).to_be_visible()

    # Narrow phones in Twi
    overflow = {}
    page.set_viewport_size({"width": 320, "height": 640})
    for path in ["/", "/record/sale", "/record/transfer", "/record/owner_draw", "/records", "/learn", "/health", "/learn/price-for-profit", "/learn/keep-daily-records", "/settings"]:
        page.goto(BASE + path)
        page.wait_for_timeout(400)
        overflow[path] = page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
    page.goto(BASE + "/")
    page.wait_for_timeout(300)
    page.screenshot(path=f"{OUT}/t6-home-twi-320.png")
    page.goto(BASE + "/record/transfer")
    page.wait_for_timeout(300)
    page.screenshot(path=f"{OUT}/t7-transfer-twi-320.png")
    page.goto(BASE + "/records")
    page.wait_for_timeout(300)
    page.screenshot(path=f"{OUT}/t8-records-twi-320.png")
    browser.close()

print("page errors:", errors)
print("horizontal overflow at 320px:", overflow)
assert not errors, errors
assert not any(overflow.values()), overflow
print("TWI AND AUDIO E2E PASSED")
