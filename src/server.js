'use strict';

const express = require('express');
const path = require('path');
const chokidar = require('chokidar');
const ops = require('./fs-ops');
const { searchProject, searchAll } = require('./search');

function createServer(port = 3000) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // ── SSE: live updates when files change ──────────────────────────────────
  const sseClients = new Set();

  function broadcast(event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
      try { res.write(msg); } catch (_) { sseClients.delete(res); }
    }
  }

  const watcher = chokidar.watch(ops.DATA_DIR, {
    ignoreInitial: true,
    depth: 4,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
  });

  watcher.on('all', (event, filePath) => {
    if (!filePath.endsWith('.json')) return;
    const parts = filePath.replace(ops.DATA_DIR + path.sep, '').split(path.sep);
    const project = parts[0];
    if (project) broadcast('change', { project, path: filePath, event });
  });

  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    sseClients.add(res);
    res.write('event: connected\ndata: {}\n\n');
    req.on('close', () => sseClients.delete(res));
  });

  // ── Projects ─────────────────────────────────────────────────────────────

  app.get('/api/projects', (req, res) => {
    try {
      res.json(ops.listProjects());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/projects/:name', (req, res) => {
    try {
      const project = ops.loadProject(req.params.name);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json(project);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/projects', (req, res) => {
    try {
      const { name, description } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const project = ops.getOrCreateProject(name.trim(), description || '');
      res.status(201).json(project);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Questions ─────────────────────────────────────────────────────────────

  app.get('/api/projects/:name/questions', (req, res) => {
    try {
      res.json(ops.listQuestions(req.params.name));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/projects/:name/questions', (req, res) => {
    try {
      const { text, context, authorType } = req.body;
      if (!text) return res.status(400).json({ error: 'text is required' });
      const q = ops.addQuestion({
        projectName: req.params.name,
        text: text.trim(),
        context: context || '',
        authorType: authorType || 'human'
      });
      res.status(201).json(q);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/projects/:name/questions/:id', (req, res) => {
    try {
      const updated = ops.updateQuestion(req.params.name, req.params.id, req.body);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Decisions ─────────────────────────────────────────────────────────────

  app.get('/api/projects/:name/decisions', (req, res) => {
    try {
      res.json(ops.listDecisions(req.params.name));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/projects/:name/decisions', (req, res) => {
    try {
      const { questionId, choice, rationale, authorType } = req.body;
      if (!choice) return res.status(400).json({ error: 'choice is required' });
      const d = ops.addDecision({
        projectName: req.params.name,
        questionId: questionId || null,
        choice: choice.trim(),
        rationale: rationale || '',
        authorType: authorType || 'human'
      });
      res.status(201).json(d);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/projects/:name/decisions/:id', (req, res) => {
    try {
      const updated = ops.updateDecision(req.params.name, req.params.id, req.body);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/projects/:name/decisions/:id/check', (req, res) => {
    try {
      const { verdict, reason, checkedBy } = req.body;
      if (!verdict) return res.status(400).json({ error: 'verdict is required' });
      const updated = ops.recordCheck(req.params.name, req.params.id, {
        verdict, reason, checkedBy: checkedBy || 'ai'
      });
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Search ────────────────────────────────────────────────────────────────

  app.get('/api/search', (req, res) => {
    try {
      const { q = '', project, authorType, status } = req.query;
      const filters = {
        authorType: authorType || null,
        status: status || null
      };

      if (project) {
        const p = ops.loadProject(project);
        if (!p) return res.json({ questions: [], decisions: [] });
        const results = searchProject(p, q, filters);
        return res.json(results);
      }

      const projects = ops.listProjects().map(p => ops.loadProject(p.name)).filter(Boolean);
      const results = searchAll(projects, q, filters);
      res.json({ results });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Start ─────────────────────────────────────────────────────────────────

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`\n  DecisionHub running at http://localhost:${port}\n`);
      resolve(server);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`  Port ${port} is in use. Try: decisionhub --port ${port + 1}`);
      } else {
        console.error('  Server error:', err.message);
      }
      process.exit(1);
    });
  });
}

module.exports = { createServer };
