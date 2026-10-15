// Business health check (per business) and recommendations.
// Mounted at /api/businesses/:businessId.
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { requireMember } = require('../auth');
const { HttpError, validate } = require('../http');

const router = express.Router({ mergeParams: true });
const canView = requireMember();
const canAnswer = requireMember(['owner', 'manager']);
const isUuid = (id) => /^[0-9a-f-]{36}$/i.test(id || '');

async function loadAssessment(businessId, id, db = { query }) {
  if (!isUuid(id)) throw new HttpError(404, 'Health check not found.');
  const { rows } = await db.query('SELECT * FROM hc_assessments WHERE id = $1 AND business_id = $2', [id, businessId]);
  if (!rows[0]) throw new HttpError(404, 'Health check not found.');
  return rows[0];
}

async function activeQuestions(db = { query }) {
  const { rows } = await db.query(
    `SELECT q.id, q.code, q.area_code, a.name AS area_name, q.prompt, q.help_text, q.weight,
            json_agg(json_build_object('id', o.id, 'label', o.label, 'score', o.score) ORDER BY o.sort_order) AS options
       FROM hc_questions q
       JOIN hc_areas a ON a.code = q.area_code
       JOIN hc_options o ON o.question_id = q.id
      WHERE q.is_active
      GROUP BY q.id, a.name, a.sort_order
      ORDER BY a.sort_order, q.sort_order`
  );
  return rows;
}

async function recommendationsFor(businessId, userLang = 'en', statuses = ['open', 'in_progress']) {
  const { rows } = await query(
    `SELECT r.guide_slug, r.priority, r.status,
            COALESCE(gl.title, ge.title) AS title, COALESCE(gl.summary, ge.summary) AS summary,
            COALESCE(gl.read_minutes, ge.read_minutes) AS read_minutes, ge.area_code, a.name AS area_name
       FROM recommendations r
       JOIN guides ge ON ge.slug = r.guide_slug AND ge.language_code = 'en' AND ge.is_published
       LEFT JOIN guides gl ON gl.slug = r.guide_slug AND gl.language_code = $2 AND gl.is_published
       JOIN hc_areas a ON a.code = ge.area_code
      WHERE r.business_id = $1 AND r.status = ANY($3::text[])
      ORDER BY r.priority, a.sort_order, r.created_at`,
    [businessId, userLang, statuses]
  );
  return rows.map((r) => ({
    slug: r.guide_slug, title: r.title, summary: r.summary, readMinutes: r.read_minutes,
    areaCode: r.area_code, areaName: r.area_name, priority: r.priority, status: r.status,
  }));
}

async function resultFor(assessment) {
  const { rows } = await query(
    `SELECT a.code, a.name, s.score
       FROM hc_area_scores s JOIN hc_areas a ON a.code = s.area_code
      WHERE s.assessment_id = $1 ORDER BY a.sort_order`,
    [assessment.id]
  );
  return {
    id: assessment.id,
    status: assessment.status,
    overallScore: assessment.overall_score === null ? null : Math.round(Number(assessment.overall_score)),
    completedAt: assessment.completed_at,
    areas: rows.map((r) => ({ code: r.code, name: r.name, score: Math.round(Number(r.score)) })),
  };
}

// Summary for Home and the Health screen.
router.get('/health', canView, async (req, res) => {
  const [latest, progress, total] = await Promise.all([
    query(
      `SELECT * FROM hc_assessments WHERE business_id = $1 AND status = 'completed'
        ORDER BY completed_at DESC LIMIT 2`,
      [req.businessId]
    ),
    query(
      `SELECT a.id, COUNT(ans.question_id) AS answered
         FROM hc_assessments a LEFT JOIN hc_answers ans ON ans.assessment_id = a.id
        WHERE a.business_id = $1 AND a.status = 'in_progress' GROUP BY a.id`,
      [req.businessId]
    ),
    query('SELECT COUNT(*) AS n FROM hc_questions WHERE is_active'),
  ]);
  const last = latest.rows[0] ? await resultFor(latest.rows[0]) : null;
  if (last && latest.rows[1]) last.previousScore = Math.round(Number(latest.rows[1].overall_score));
  res.json({
    latest: last,
    inProgress: progress.rows[0] ? { id: progress.rows[0].id, answered: Number(progress.rows[0].answered) } : null,
    questionCount: Number(total.rows[0].n),
    recommendations: await recommendationsFor(req.businessId, req.user.preferred_language),
  });
});

// Start (or carry on with) a health check. Returns the questions and any answers so far.
router.post('/health', canAnswer, async (req, res) => {
  const assessment = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `SELECT * FROM hc_assessments WHERE business_id = $1 AND status = 'in_progress' FOR UPDATE`,
      [req.businessId]
    );
    if (rows[0]) return rows[0];
    const created = await db.query(
      `INSERT INTO hc_assessments (business_id, taken_by) VALUES ($1, $2) RETURNING *`,
      [req.businessId, req.user.id]
    );
    return created.rows[0];
  });
  const [questions, answers] = await Promise.all([
    activeQuestions(),
    query('SELECT question_id, option_id FROM hc_answers WHERE assessment_id = $1', [assessment.id]),
  ]);
  res.status(201).json({
    id: assessment.id,
    questions: questions.map((q) => ({
      id: q.id, code: q.code, areaCode: q.area_code, areaName: q.area_name, prompt: q.prompt, help: q.help_text,
      options: q.options.map((o) => ({ id: o.id, label: o.label })),
    })),
    answers: Object.fromEntries(answers.rows.map((a) => [a.question_id, a.option_id])),
  });
});

const answerSchema = z.object({ questionId: z.uuid(), optionId: z.uuid() });

router.put('/health/:assessmentId/answers', canAnswer, validate(answerSchema), async (req, res) => {
  const a = await loadAssessment(req.businessId, req.params.assessmentId);
  if (a.status !== 'in_progress') throw new HttpError(409, 'This health check is already finished.');
  const { questionId, optionId } = req.valid.body;
  const { rows } = await query(
    `SELECT 1 FROM hc_options o JOIN hc_questions q ON q.id = o.question_id
      WHERE o.id = $1 AND q.id = $2 AND q.is_active`,
    [optionId, questionId]
  );
  if (!rows[0]) throw new HttpError(400, 'That answer does not belong to this question.');
  await query(
    `INSERT INTO hc_answers (assessment_id, question_id, option_id) VALUES ($1,$2,$3)
     ON CONFLICT (assessment_id, question_id) DO UPDATE SET option_id = EXCLUDED.option_id, answered_at = now()`,
    [a.id, questionId, optionId]
  );
  res.status(204).end();
});

// Score it and work out what to read first.
router.post('/health/:assessmentId/complete', canAnswer, async (req, res) => {
  await withTransaction(async (db) => {
    const a = await loadAssessment(req.businessId, req.params.assessmentId, db);
    if (a.status !== 'in_progress') throw new HttpError(409, 'This health check is already finished.');

    const { rows: answers } = await db.query(
      `SELECT q.id AS question_id, q.area_code, q.weight, o.score
         FROM hc_questions q
         LEFT JOIN hc_answers ans ON ans.question_id = q.id AND ans.assessment_id = $1
         LEFT JOIN hc_options o ON o.id = ans.option_id
        WHERE q.is_active`,
      [a.id]
    );
    const missing = answers.filter((r) => r.score === null).length;
    if (missing) throw new HttpError(400, `Please answer all the questions (${missing} left).`);

    // Area score = weighted points out of the maximum (4 per question), as a percentage.
    const areas = {};
    for (const r of answers) {
      const w = Number(r.weight);
      areas[r.area_code] ??= { got: 0, max: 0 };
      areas[r.area_code].got += r.score * w;
      areas[r.area_code].max += 4 * w;
    }
    const areaScores = Object.fromEntries(Object.entries(areas).map(([k, v]) => [k, (v.got / v.max) * 100]));
    const overall = Object.values(areaScores).reduce((s, x) => s + x, 0) / Object.keys(areaScores).length;

    for (const [code, score] of Object.entries(areaScores)) {
      await db.query('INSERT INTO hc_area_scores (assessment_id, area_code, score) VALUES ($1,$2,$3)', [a.id, code, score.toFixed(2)]);
    }
    await db.query(
      `UPDATE hc_assessments SET status = 'completed', overall_score = $2, completed_at = now() WHERE id = $1`,
      [a.id, overall.toFixed(2)]
    );

    // Guides to recommend: weak answers, most urgent where the area is weakest.
    const { rows: triggered } = await db.query(
      `SELECT DISTINCT qg.guide_slug, q.area_code
         FROM hc_answers ans
         JOIN hc_options o ON o.id = ans.option_id
         JOIN hc_questions q ON q.id = ans.question_id
         JOIN hc_question_guides qg ON qg.question_id = q.id AND o.score <= qg.max_score
        WHERE ans.assessment_id = $1`,
      [a.id]
    );
    const bySlug = new Map();
    for (const t of triggered) {
      const priority = Math.min(5, 1 + Math.floor(areaScores[t.area_code] / 25));
      bySlug.set(t.guide_slug, Math.min(bySlug.get(t.guide_slug) ?? 5, priority));
    }
    for (const [slug, priority] of bySlug) {
      await db.query(
        `INSERT INTO recommendations (business_id, assessment_id, guide_slug, priority, status)
         VALUES ($1,$2,$3,$4,'open')
         ON CONFLICT (business_id, guide_slug) DO UPDATE SET
           assessment_id = EXCLUDED.assessment_id, priority = EXCLUDED.priority,
           status = CASE WHEN recommendations.status = 'dismissed' THEN 'dismissed' ELSE 'open' END,
           updated_at = now()`,
        [req.businessId, a.id, slug, priority]
      );
    }
    // Things that were weak last time but aren't now: mark as done.
    await db.query(
      `UPDATE recommendations SET status = 'done', updated_at = now()
        WHERE business_id = $1 AND status IN ('open','in_progress') AND NOT (guide_slug = ANY($2::text[]))`,
      [req.businessId, [...bySlug.keys()]]
    );
  });
  const a = await loadAssessment(req.businessId, req.params.assessmentId);
  res.json({ result: await resultFor(a), recommendations: await recommendationsFor(req.businessId, req.user.preferred_language) });
});

router.get('/health/:assessmentId', canView, async (req, res) => {
  const a = await loadAssessment(req.businessId, req.params.assessmentId);
  res.json({ result: await resultFor(a), recommendations: await recommendationsFor(req.businessId, req.user.preferred_language) });
});

const recSchema = z.object({ status: z.enum(['open', 'done', 'dismissed']) });

router.patch('/recommendations/:slug', canAnswer, validate(recSchema), async (req, res) => {
  const { rowCount } = await query(
    `UPDATE recommendations SET status = $3, updated_at = now() WHERE business_id = $1 AND guide_slug = $2`,
    [req.businessId, req.params.slug, req.valid.body.status]
  );
  if (!rowCount) throw new HttpError(404, 'Recommendation not found.');
  res.status(204).end();
});

module.exports = { router };
