'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.decisionhub');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50);
}

function nextId(dir, prefix) {
  ensureDir(dir);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const nums = files
    .map(f => parseInt(f.replace(/\D.*/, ''), 10))
    .filter(n => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return String(next).padStart(3, '0');
}

// ── Projects ──────────────────────────────────────────────────────────────────

function listProjects() {
  ensureDir(DATA_DIR);
  return fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const indexPath = path.join(DATA_DIR, d.name, 'index.json');
      if (fs.existsSync(indexPath)) {
        return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      }
      return { name: d.name, description: '', createdAt: null };
    });
}

function getOrCreateProject(name, description = '') {
  const projectDir = path.join(DATA_DIR, name);
  const indexPath = path.join(projectDir, 'index.json');
  ensureDir(path.join(projectDir, 'questions'));
  ensureDir(path.join(projectDir, 'decisions'));

  if (fs.existsSync(indexPath)) {
    return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  }

  const project = { name, description, createdAt: new Date().toISOString() };
  fs.writeFileSync(indexPath, JSON.stringify(project, null, 2));
  return project;
}

// ── Open Questions ────────────────────────────────────────────────────────────

function listQuestions(projectName) {
  const dir = path.join(DATA_DIR, projectName, 'questions');
  ensureDir(dir);
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

function addQuestion({ projectName, text, context = '', authorType = 'human' }) {
  getOrCreateProject(projectName);
  const dir = path.join(DATA_DIR, projectName, 'questions');
  const num = nextId(dir, 'oq');
  const slug = slugify(text);
  const id = `oq-${num}-${slug}`;
  const fileName = `${id}.json`;

  const question = {
    id,
    slug,
    text,
    context,
    authorType,
    project: projectName,
    status: 'open',
    createdAt: new Date().toISOString(),
    decisionId: null
  };

  fs.writeFileSync(path.join(dir, fileName), JSON.stringify(question, null, 2));
  return question;
}

function updateQuestion(projectName, questionId, fields) {
  const dir = path.join(DATA_DIR, projectName, 'questions');
  const file = fs.readdirSync(dir).find(f => f.startsWith(questionId) || f.includes(questionId));
  if (!file) throw new Error(`Question ${questionId} not found`);

  const filePath = path.join(dir, file);
  const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const updated = { ...existing, ...fields, updatedAt: new Date().toISOString() };
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
  return updated;
}

// ── Decisions ─────────────────────────────────────────────────────────────────

function listDecisions(projectName) {
  const dir = path.join(DATA_DIR, projectName, 'decisions');
  ensureDir(dir);
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

function addDecision({ projectName, questionId, choice, rationale, authorType = 'human' }) {
  getOrCreateProject(projectName);
  const dir = path.join(DATA_DIR, projectName, 'decisions');
  const num = nextId(dir, 'd');
  const slug = slugify(choice);
  const id = `d-${num}-${slug}`;
  const fileName = `${id}.json`;

  const decision = {
    id,
    slug,
    questionId: questionId || null,
    choice,
    rationale,
    authorType,
    project: projectName,
    createdAt: new Date().toISOString(),
    implementationCheck: {
      verdict: null,
      reason: null,
      checkedAt: null,
      checkedBy: null
    }
  };

  fs.writeFileSync(path.join(dir, fileName), JSON.stringify(decision, null, 2));

  // Link question to this decision
  if (questionId) {
    try {
      updateQuestion(projectName, questionId, { status: 'decided', decisionId: id });
    } catch (_) { /* question might not exist */ }
  }

  return decision;
}

function updateDecision(projectName, decisionId, fields) {
  const dir = path.join(DATA_DIR, projectName, 'decisions');
  const file = fs.readdirSync(dir).find(f => f.startsWith(decisionId) || f.includes(decisionId));
  if (!file) throw new Error(`Decision ${decisionId} not found`);

  const filePath = path.join(dir, file);
  const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const updated = { ...existing, ...fields, updatedAt: new Date().toISOString() };
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
  return updated;
}

function recordCheck(projectName, decisionId, { verdict, reason, checkedBy = 'ai' }) {
  return updateDecision(projectName, decisionId, {
    implementationCheck: {
      verdict,   // 'meets' | 'partial' | 'does-not-meet'
      reason,
      checkedAt: new Date().toISOString(),
      checkedBy
    }
  });
}

// ── Full project load ─────────────────────────────────────────────────────────

function loadProject(name) {
  const indexPath = path.join(DATA_DIR, name, 'index.json');
  if (!fs.existsSync(indexPath)) return null;

  const project = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const questions = listQuestions(name);
  const decisions = listDecisions(name);
  return { ...project, questions, decisions };
}

module.exports = {
  DATA_DIR,
  listProjects,
  getOrCreateProject,
  listQuestions,
  addQuestion,
  updateQuestion,
  listDecisions,
  addDecision,
  updateDecision,
  recordCheck,
  loadProject
};
