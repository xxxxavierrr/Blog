/**
 * sync.js — Obsidian Vault → Hugo Content Sync
 *
 * Rules:
 * - Folder path → tags (each directory level becomes a tag)
 * - Manual tags in YAML frontmatter → merged with auto tags
 * - Filename date prefix (YYYY.M.D) → Hugo date
 * - Empty/single-line files → skipped
 */

const fs = require('fs');
const path = require('path');

const VAULT = path.join(__dirname, '..', 'vault');
const CONTENT = path.join(__dirname, '..', 'content');
const ASSETS = path.join(__dirname, '..', 'assets');

// Directories/files to exclude
const EXCLUDE_DIRS = new Set(['.obsidian', '.git']);
const SKIP_TAG_DIRS = new Set(['附件', 'attachments', 'img']);
const SKIP_SECTION_DIRS = new Set(['附件', 'attachments', 'img']); // sync files, but don't create sections
const EXCLUDE_FILES = new Set(['progress.json']);

// Files in these dirs get their folder name as a tag too
const CONTENT_DIRS = new Set(['面试记录', '高频考点分析', '八股']);

// Build a filename → full path map for all non-md files in vault
function buildAssetMap(vaultPath) {
  const map = {};
  function scan(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && !EXCLUDE_DIRS.has(e.name)) {
        scan(full);
      } else if (e.isFile() && !e.name.endsWith('.md') && !EXCLUDE_FILES.has(e.name)) {
        if (!map[e.name]) map[e.name] = [];
        map[e.name].push(full);
      }
    }
  }
  scan(vaultPath);
  return map;
}

function findFileInVault(vaultPath, filename) {
  const results = [];
  function scan(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && !EXCLUDE_DIRS.has(e.name)) scan(full);
      else if (e.isFile() && e.name === filename) results.push(full);
    }
  }
  scan(vaultPath);
  return results[0] || null;
}

let assetMap = null;

function resolveAndCopyAsset(refName, mdDir, staticDir) {
  // Vault is served directly via Hugo staticDir — no copying needed
  // Returns: the URL path (e.g., "/学习笔记/CS336/附件/image.png")

  if (!assetMap) assetMap = buildAssetMap(VAULT);
  const basename = path.basename(refName);

  let srcFile = null;

  // 1. Try relative to the md file
  const relPath = path.join(mdDir, refName);
  if (fs.existsSync(relPath)) srcFile = relPath;

  // 2. Try by filename in asset map
  if (!srcFile && assetMap[basename]) {
    const candidates = assetMap[basename];
    srcFile = candidates[0];
    for (const c of candidates) {
      if (c.startsWith(mdDir)) { srcFile = c; break; }
    }
  }

  if (!srcFile) return null;

  const urlPath = path.relative(VAULT, srcFile).replace(/\\/g, '/').replace(/ /g, '%20');
  return `/Blog/${urlPath}`;
}

function rewriteImageRefs(body, mdDir, staticDir) {
  // Rewrite ![alt](path) and [text](path) to use resolved asset paths
  // Also handle Obsidian ![[filename]] format

  // Standard markdown images: ![alt](path)
  body = body.replace(/!\[([^\]]*)\]\((.+?)\)(?=[\s@]|$)/g, (match, alt, ref) => {
    if (ref.startsWith('http://') || ref.startsWith('https://')) return match;
    const newPath = resolveAndCopyAsset(ref, mdDir, staticDir);
    if (newPath) return `![${alt}](${newPath})`;
    return match; // keep original if not found
  });

  // Standard markdown links: [text](path) that point to local files
  body = body.replace(/\[([^\]]+)\]\((.+?)\)(?=[\s@]|$)/g, (match, text, ref) => {
    if (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('/')) return match;
    if (ref.startsWith('#')) return match; // anchor links
    // .md file link → find file in vault, use staticDir URL
    if (ref.endsWith('.md')) {
      let mdAbs = path.resolve(mdDir, ref);
      if (!fs.existsSync(mdAbs)) {
        mdAbs = findFileInVault(VAULT, path.basename(ref));
      }
      if (mdAbs) {
        const urlPath = path.relative(VAULT, mdAbs).replace(/\\/g, '/').replace(/ /g, '%20');
        return `[${text}](/Blog/${urlPath})`;
      }
      return match;
    }
    const newPath = resolveAndCopyAsset(ref, mdDir, staticDir);
    if (newPath) return `[${text}](${newPath})`;
    return match; // keep original if not found
  });

  // Obsidian embed: ![[filename]]
  body = body.replace(/!\[\[([^\]]+)\]\]/g, (match, ref) => {
    // Remove any alias after | or #
    const filename = ref.split('|')[0].split('#')[0].trim();
    const newPath = resolveAndCopyAsset(filename, mdDir, staticDir);
    if (newPath) {
      if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(filename)) {
        return `![](${newPath})`;
      }
      return `[${ref}](${newPath})`;
    }
    return match;
  });

  return body;
}

function parseFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') return { frontmatter: {}, body: text };

  const endIdx = lines.slice(1).findIndex(l => l.trim() === '---');
  if (endIdx === -1) return { frontmatter: {}, body: text };

  const fmLines = lines.slice(1, endIdx + 1);
  const fm = {};
  for (const line of fmLines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      let val = line.slice(colonIdx + 1).trim();
      // Parse YAML array: [a, b, c] or - a\n- b
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      }
      fm[key] = val;
    }
  }

  return { frontmatter: fm, body: lines.slice(endIdx + 2).join('\n') };
}

function parseFilename(filename) {
  // "2026.5.15 滴滴中间件一面" → { date: "2026-05-15", title: "滴滴中间件一面" }
  const name = filename.replace(/\.md$/, '');
  const match = name.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})\s+(.+)$/);
  if (match) {
    const y = match[1];
    const m = match[2].padStart(2, '0');
    const d = match[3].padStart(2, '0');
    return { date: `${y}-${m}-${d}`, title: match[4] };
  }
  return { date: null, title: name };
}

function getPathTags(relPath) {
  // 面经/面试记录/xxx.md → [面经, 面试记录]
  const parts = relPath.split(path.sep);
  // All directory parts except the filename become tags, skip asset dirs
  return parts.slice(0, -1).filter(p => p && !SKIP_TAG_DIRS.has(p));
}

function getAllSections(vaultPath) {
  // Scan vault for all directories that contain .md files → section paths
  const sections = new Set();
  function scan(dir, rel = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let hasMd = false;
    let childHasMd = false;
    for (const e of entries) {
      if (e.isDirectory() && !EXCLUDE_DIRS.has(e.name) && !SKIP_TAG_DIRS.has(e.name)) {
        const subRel = rel ? path.join(rel, e.name) : e.name;
        if (scan(path.join(dir, e.name), subRel)) {
          sections.add(subRel);
          childHasMd = true;
        }
      } else if (e.isFile() && e.name.endsWith('.md')) {
        hasMd = true;
      }
    }
    // Parent dir is also a section if children have md
    if (rel && (hasMd || childHasMd)) {
      sections.add(rel);
    }
    return hasMd || childHasMd;
  }
  scan(vaultPath);
  return [...sections].sort();
}

// Color palette for tag images
const TAG_COLORS = [
  ['#6366f1', '#8b5cf6'], // indigo→purple
  ['#0891b2', '#06b6d4'], // cyan
  ['#059669', '#10b981'], // emerald
  ['#d97706', '#f59e0b'], // amber
  ['#dc2626', '#ef4444'], // red
  ['#7c3aed', '#a855f7'], // violet
  ['#db2777', '#f472b6'], // pink
  ['#2563eb', '#3b82f6'], // blue
];

function ensureTagImage(tag) {
  const safeName = tag.replace(/[<>:"/\\|?*]/g, '_');
  const imgDir = path.join(ASSETS, 'img', 'tags');
  const imgFile = path.join(imgDir, `${safeName}.svg`);
  const imgPath = `/img/tags/${safeName}.svg`;

  if (fs.existsSync(imgFile)) return imgPath;

  fs.mkdirSync(imgDir, { recursive: true });

  // Pick color based on hash of tag name
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0;
  const [c1, c2] = TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];

  // Truncate long tags
  const displayText = tag.length > 6 ? tag.slice(0, 6) + '..' : tag;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${c1};stop-opacity:0.9" />
      <stop offset="100%" style="stop-color:${c2};stop-opacity:0.7" />
    </linearGradient>
  </defs>
  <rect width="800" height="400" fill="url(#bg)" rx="12"/>
  <text x="400" y="215" text-anchor="middle" fill="white" font-size="52" font-family="system-ui,sans-serif" font-weight="bold" opacity="0.95">${displayText}</text>
</svg>`;

  fs.writeFileSync(imgFile, svg, 'utf-8');
  return imgPath;
}

function syncDir(dir, relPath = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const entryRelPath = relPath ? path.join(relPath, entry.name) : entry.name;

    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name) || SKIP_TAG_DIRS.has(entry.name)) continue;
      results.push(...syncDir(fullPath, entryRelPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      if (EXCLUDE_FILES.has(entry.name)) continue;

      const raw = fs.readFileSync(fullPath, 'utf-8');
      const lines = raw.trim().split('\n').filter(l => l.trim());

      // Skip empty or near-empty files
      if (lines.length <= 1) {
        console.log(`  SKIP (empty): ${entryRelPath}`);
        continue;
      }

      const relDir = path.dirname(entryRelPath);
      const autoTags = getPathTags(entryRelPath);
      const { frontmatter: existingFm, body: rawBody } = parseFrontmatter(raw);
      const body = rewriteImageRefs(rawBody, path.dirname(fullPath), path.join(__dirname, '..', 'static'));
      const { date, title } = parseFilename(entry.name);

      // Merge tags: auto (from path) + manual (from frontmatter)
      const manualTags = Array.isArray(existingFm.tags) ? existingFm.tags : [];
      const allTags = [...new Set([...autoTags, ...manualTags])];

      // Build Hugo frontmatter
      const hugoDate = existingFm.date || date || new Date().toISOString().slice(0, 10);
      const hugoTitle = existingFm.title || title;

      // Generate text-based featured image from deepest tag
      const deepestTag = autoTags[autoTags.length - 1] || 'note';
      const featuredImg = ensureTagImage(deepestTag);

      const fmLines = ['---'];
      fmLines.push(`title: "${hugoTitle.replace(/"/g, '\\"')}"`);
      fmLines.push(`date: ${hugoDate}`);
      fmLines.push(`featureimage: "${featuredImg}"`);
      if (allTags.length > 0) {
        fmLines.push(`tags: [${allTags.map(t => `"${t}"`).join(', ')}]`);
      }
      fmLines.push('---');
      fmLines.push('');

      const hugoContent = fmLines.join('\n') + body;

      // Hierarchical: preserve vault folder structure
      const outDir = path.join(CONTENT, relDir);
      fs.mkdirSync(outDir, { recursive: true });
      const outFile = path.join(outDir, entry.name);
      fs.writeFileSync(outFile, hugoContent, 'utf-8');

      console.log(`  OK: ${entryRelPath} → content/${relDir}/${entry.name}`);
      console.log(`       tags: [${allTags.join(', ')}]`);
      results.push({ file: entryRelPath, tags: allTags, date: hugoDate });
    }
  }

  return results;
}

// Clear old generated content (but keep _index.md and taxonomy files)
console.log('Clearing old content...');
if (fs.existsSync(CONTENT)) {
  // Clear all vault section dirs and old posts dir
  const vaultTopDirs = fs.readdirSync(VAULT, { withFileTypes: true })
    .filter(e => e.isDirectory() && !EXCLUDE_DIRS.has(e.name))
    .map(e => e.name);
  for (const dir of vaultTopDirs) {
    const contentDir = path.join(CONTENT, dir);
    if (fs.existsSync(contentDir)) {
      fs.rmSync(contentDir, { recursive: true, force: true });
      console.log(`  Cleared: content/${dir}/`);
    }
  }
  // Clear old flat posts/ dir (transition from old structure)
  const postsDir = path.join(CONTENT, 'posts');
  if (fs.existsSync(postsDir)) {
    fs.rmSync(postsDir, { recursive: true, force: true });
    console.log('  Cleared: content/posts/');
  }
}

// Re-create section _index.md files with weights for ordering
const sections = getAllSections(VAULT);
// Top-level section ordering: 学习笔记=10, 面经=20, others=100
const TOP_WEIGHTS = { '学习笔记': 10, '面经': 20 };
for (const sec of sections) {
  const secDir = path.join(CONTENT, sec);
  const idxFile = path.join(secDir, '_index.md');
  fs.mkdirSync(secDir, { recursive: true });
  const secName = path.basename(sec);
  // Set weight for top-level sections (controls tab order)
  const isTop = !sec.includes(path.sep);
  const weight = isTop ? (TOP_WEIGHTS[secName] || 100) : null;
  const weightLine = weight != null ? `weight: ${weight}\n` : '';
  fs.writeFileSync(idxFile,
    '---\n' +
    `title: "${secName}"\n` +
    weightLine +
    `description: ""\n` +
    '---\n', 'utf-8');
  console.log(`  Created section: ${sec}/_index.md ${weight != null ? '(weight: ' + weight + ')' : ''}`);
}

console.log('Syncing vault → content...');
const allResults = syncDir(VAULT);

console.log(`\nDone! Synced ${allResults.length} posts.`);

// Group by tag for verification
const tagCounts = {};
for (const r of allResults) {
  for (const t of r.tags) {
    tagCounts[t] = (tagCounts[t] || 0) + 1;
  }
}
console.log('\nTag summary:');
for (const [tag, count] of Object.entries(tagCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${tag}: ${count}`);
}

// Auto-update mainSections in params.toml
const PARAMS_PATH = path.join(__dirname, '..', 'config', '_default', 'params.toml');
try {
  let paramsContent = fs.readFileSync(PARAMS_PATH, 'utf-8');
  // Re-read vault top dirs (already computed above — reuse vaultTopDirs from clearing step)
  // vaultTopDirs is scoped inside the if block, so recompute
  const topDirs = fs.readdirSync(VAULT, { withFileTypes: true })
    .filter(e => e.isDirectory() && !EXCLUDE_DIRS.has(e.name))
    .map(e => e.name);
  const ORDER = { '学习笔记': 1, '面经': 2 };
  const sorted = topDirs.sort((a, b) => (ORDER[a] || 99) - (ORDER[b] || 99));
  const sectionsList = sorted.map(s => `"${s}"`).join(', ');
  paramsContent = paramsContent.replace(
    /mainSections\s*=\s*\[.*?\]/,
    `mainSections = [${sectionsList}]`
  );
  fs.writeFileSync(PARAMS_PATH, paramsContent, 'utf-8');
  console.log(`\nUpdated mainSections: [${sectionsList}]`);
} catch (err) {
  console.error(`Failed to update mainSections: ${err.message}`);
}
