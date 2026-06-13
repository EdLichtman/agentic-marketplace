#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
let errors = [];

function readJson(relPath) {
  const abs = path.join(repoRoot, relPath);
  const raw = fs.readFileSync(abs, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    errors.push(`${relPath}: invalid JSON (${err.message})`);
    return null;
  }
}

function walk(dir, exclude) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (exclude.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(abs, exclude));
    } else if (entry.name.endsWith(".json")) {
      out.push(abs);
    }
  }
  return out;
}

// 1. Every *.json file in the repo must be syntactically valid JSON.
const exclude = new Set(["node_modules", ".git"]);
for (const abs of walk(repoRoot, exclude)) {
  const rel = path.relative(repoRoot, abs);
  try {
    JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (err) {
    errors.push(`${rel}: invalid JSON (${err.message})`);
  }
}

// 2. marketplace.json must have the required top-level shape.
const marketplace = readJson(".claude-plugin/marketplace.json");
if (marketplace) {
  if (typeof marketplace.name !== "string") {
    errors.push("marketplace.json: missing string field 'name'");
  }
  if (!marketplace.owner || typeof marketplace.owner.name !== "string") {
    errors.push("marketplace.json: missing 'owner.name'");
  }
  if (!Array.isArray(marketplace.plugins)) {
    errors.push("marketplace.json: 'plugins' must be an array");
  } else {
    const pluginRoot = marketplace.metadata && marketplace.metadata.pluginRoot
      ? marketplace.metadata.pluginRoot
      : "./plugins";

    for (const [i, plugin] of marketplace.plugins.entries()) {
      const label = `marketplace.json: plugins[${i}]`;
      if (typeof plugin.name !== "string") {
        errors.push(`${label}: missing string field 'name'`);
        continue;
      }
      if (typeof plugin.source !== "string") {
        errors.push(`${label} (${plugin.name}): missing string field 'source'`);
        continue;
      }
      if (typeof plugin.description !== "string") {
        errors.push(`${label} (${plugin.name}): missing string field 'description'`);
      }

      const pluginDir = path.join(repoRoot, pluginRoot, plugin.source);
      const manifestPath = path.join(pluginDir, ".claude-plugin", "plugin.json");
      if (!fs.existsSync(manifestPath)) {
        errors.push(`${label} (${plugin.name}): missing manifest at ${path.relative(repoRoot, manifestPath)}`);
        continue;
      }

      let manifest;
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      } catch (err) {
        errors.push(`${path.relative(repoRoot, manifestPath)}: invalid JSON (${err.message})`);
        continue;
      }
      if (typeof manifest.name !== "string") {
        errors.push(`${path.relative(repoRoot, manifestPath)}: missing string field 'name'`);
      }
      if (typeof manifest.description !== "string") {
        errors.push(`${path.relative(repoRoot, manifestPath)}: missing string field 'description'`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error("Marketplace validation failed:\n");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("Marketplace validation passed.");
