'use strict';

const SNIPPET_RADIUS = 120;

/**
 * Extract a highlighted snippet around the first match of `query` in `text`.
 * Returns null if no match.
 */
function extractSnippet(text, query) {
  if (!text || !query) return null;
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx === -1) return null;

  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(text.length, idx + query.length + SNIPPET_RADIUS);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  const snippet = prefix + text.slice(start, end) + suffix;

  // Calculate where the match is within the snippet string
  const matchStart = prefix.length + (idx - start);
  const matchEnd = matchStart + query.length;

  return { snippet, matchStart, matchEnd };
}

/**
 * Search across all questions and decisions in a project.
 * Returns results with type, item, and highlighted snippet.
 */
function searchProject(project, rawQuery, { authorType, status } = {}) {
  const query = rawQuery.trim();
  if (!query && !authorType && !status) return { questions: [], decisions: [] };

  const questionResults = [];
  const decisionResults = [];

  for (const q of (project.questions || [])) {
    // Filter by author/status if set
    if (authorType && q.authorType !== authorType) continue;
    if (status === 'open' && q.status !== 'open') continue;
    if (status === 'decided' && q.status !== 'decided') continue;

    if (!query) {
      questionResults.push({ item: q, snippet: null, field: null });
      continue;
    }

    // Search in text and context
    const inText = extractSnippet(q.text, query);
    const inContext = !inText && q.context ? extractSnippet(q.context, query) : null;

    if (inText) {
      questionResults.push({ item: q, snippet: inText, field: 'text' });
    } else if (inContext) {
      questionResults.push({ item: q, snippet: inContext, field: 'context' });
    }
  }

  for (const d of (project.decisions || [])) {
    if (authorType && d.authorType !== authorType) continue;

    if (!query) {
      decisionResults.push({ item: d, snippet: null, field: null });
      continue;
    }

    const inChoice = extractSnippet(d.choice, query);
    const inRationale = !inChoice && d.rationale ? extractSnippet(d.rationale, query) : null;

    if (inChoice) {
      decisionResults.push({ item: d, snippet: inChoice, field: 'choice' });
    } else if (inRationale) {
      decisionResults.push({ item: d, snippet: inRationale, field: 'rationale' });
    }
  }

  return { questions: questionResults, decisions: decisionResults };
}

/**
 * Search across all projects.
 */
function searchAll(projects, query, filters = {}) {
  const results = [];
  for (const project of projects) {
    const { questions, decisions } = searchProject(project, query, filters);
    for (const r of questions) results.push({ project: project.name, type: 'question', ...r });
    for (const r of decisions) results.push({ project: project.name, type: 'decision', ...r });
  }
  return results;
}

module.exports = { searchProject, searchAll, extractSnippet };
