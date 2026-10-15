// Loads the health check questions and the guides from server/content/
// into the database. Safe to run again and again: it updates in place.
// Runs automatically at the end of `npm run migrate`.
const fs = require('fs');
const path = require('path');

const CONTENT = path.join(__dirname, '..', 'content');

// Minimal front matter: lines of "key: value" between --- markers.
function parseGuide(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const key of ['slug', 'title', 'area', 'summary']) {
    if (!meta[key]) throw new Error(`${file}: front matter needs "${key}"`);
  }
  return { ...meta, body: m[2].trim() + '\n' };
}

function loadGuides() {
  const root = path.join(CONTENT, 'guides');
  const guides = [];
  for (const lang of fs.readdirSync(root)) {
    const dir = path.join(root, lang);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) {
      guides.push({ ...parseGuide(path.join(dir, f)), language: lang });
    }
  }
  return guides;
}

async function seedContent(db, { log = () => {} } = {}) {
  // Guides
  const guides = loadGuides();
  for (const g of guides) {
    await db.query(
      `INSERT INTO guides (slug, language_code, area_code, title, summary, body_md, read_minutes,
                           tool_path, tool_label, reviewed_at, is_draft, is_published)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, TRUE)
       ON CONFLICT (slug, language_code) DO UPDATE SET
         area_code = EXCLUDED.area_code, title = EXCLUDED.title, summary = EXCLUDED.summary,
         body_md = EXCLUDED.body_md, read_minutes = EXCLUDED.read_minutes,
         tool_path = EXCLUDED.tool_path, tool_label = EXCLUDED.tool_label,
         reviewed_at = EXCLUDED.reviewed_at, is_draft = EXCLUDED.is_draft, is_published = TRUE,
         version = guides.version + (CASE WHEN guides.body_md IS DISTINCT FROM EXCLUDED.body_md THEN 1 ELSE 0 END),
         updated_at = now()`,
      [g.slug, g.language, g.area, g.title, g.summary, g.body, Number(g.readMinutes) || null,
       g.toolPath || null, g.toolLabel || null, g.reviewed || null, g.draft === 'true']
    );
  }

  const english = new Set(guides.filter((g) => g.language === 'en').map((g) => g.slug));
  for (const g of guides) {
    if (g.language !== 'en' && !english.has(g.slug)) {
      throw new Error(`guides/${g.language}/${g.slug}.md has no English original with the same slug`);
    }
  }

  // Health check questions
  delete require.cache[require.resolve(path.join(CONTENT, 'health-check.js'))];
  const questions = require(path.join(CONTENT, 'health-check.js'));
  const slugs = new Set(guides.map((g) => g.slug));
  const seen = new Set();
  let order = 0;
  for (const q of questions) {
    if (seen.has(q.code)) throw new Error(`health-check.js: duplicate code ${q.code}`);
    seen.add(q.code);
    const { rows } = await db.query(
      `INSERT INTO hc_questions (code, area_code, prompt, help_text, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5, TRUE)
       ON CONFLICT (code) DO UPDATE SET area_code = EXCLUDED.area_code, prompt = EXCLUDED.prompt,
         help_text = EXCLUDED.help_text, sort_order = EXCLUDED.sort_order, is_active = TRUE
       RETURNING id`,
      [q.code, q.area, q.prompt, q.help || null, order++]
    );
    const qid = rows[0].id;
    for (const [i, [label, score]] of q.options.entries()) {
      await db.query(
        `INSERT INTO hc_options (question_id, label, score, sort_order) VALUES ($1,$2,$3,$4)
         ON CONFLICT (question_id, sort_order) DO UPDATE SET label = EXCLUDED.label, score = EXCLUDED.score`,
        [qid, label, score, i]
      );
    }
    // Remove options dropped from the file, unless someone already chose them.
    await db.query(
      `DELETE FROM hc_options o WHERE o.question_id = $1 AND o.sort_order >= $2
         AND NOT EXISTS (SELECT 1 FROM hc_answers a WHERE a.option_id = o.id)`,
      [qid, q.options.length]
    );
    await db.query('DELETE FROM hc_question_guides WHERE question_id = $1', [qid]);
    for (const g of q.guides || []) {
      if (!slugs.has(g.slug)) throw new Error(`health-check.js: ${q.code} points to unknown guide "${g.slug}"`);
      await db.query(
        'INSERT INTO hc_question_guides (question_id, guide_slug, max_score) VALUES ($1,$2,$3)',
        [qid, g.slug, g.max]
      );
    }
  }
  // Questions removed from the file stop being asked; old answers are kept.
  await db.query('UPDATE hc_questions SET is_active = FALSE WHERE code IS NOT NULL AND NOT (code = ANY($1::text[]))', [[...seen]]);

  log(`Loaded ${guides.length} guides and ${questions.length} health check questions.`);
}

module.exports = { seedContent, loadGuides, parseGuide };
