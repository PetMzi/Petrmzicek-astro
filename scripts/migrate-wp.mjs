/**
 * migrate-wp.mjs
 * Migruje WordPress XML export do Astro MD souborů.
 * Použití: node scripts/migrate-wp.mjs <cesta-k-xml>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseStringPromise } from 'xml2js';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// --- Konfigurace ---
const BLOG_DIR = path.join(ROOT, 'src/content/blog');
const PAGES_DIR = path.join(ROOT, 'src/content/pages');
const XML_FILE = process.argv[2];

if (!XML_FILE) {
  console.error('Použití: node scripts/migrate-wp.mjs <cesta-k-xml>');
  process.exit(1);
}

// --- Turndown setup ---
const td = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});
td.use(gfm);

// Ignorovat WordPress Gutenberg komentáře
td.addRule('wp-comments', {
  filter: (node) => node.nodeType === 8, // Comment node
  replacement: () => '',
});

// --- Pomocné funkce ---

function sanitizeYamlString(str) {
  if (!str) return '';
  // Nahradit uvozovky escaped verzí a obalit do dvojitých uvozovek
  return str.replace(/"/g, '\\"');
}

function slugFromUrl(link) {
  try {
    const url = new URL(link);
    // Odstraní trailing slash a vezme poslední segment
    const parts = url.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    return parts[parts.length - 1] || 'untitled';
  } catch {
    return 'untitled';
  }
}

function wpDateToISO(dateStr) {
  if (!dateStr || dateStr === '0000-00-00 00:00:00') return null;
  // WP formát: "2024-01-15 10:30:00" → ISO
  return new Date(dateStr.replace(' ', 'T') + 'Z').toISOString().split('T')[0];
}

function htmlToMarkdown(html) {
  if (!html) return '';
  // Vyčistit Gutenberg bloky (<!-- wp:... --> komentáře)
  let cleaned = html.replace(/<!-- wp:[^>]*-->/g, '').replace(/<!-- \/wp:[^>]*-->/g, '');
  // Odstranit prázdné figcaption
  cleaned = cleaned.replace(/<figcaption[^>]*>\s*<\/figcaption>/g, '');
  try {
    return td.turndown(cleaned).trim();
  } catch {
    return '';
  }
}

function buildFrontmatter(data) {
  const lines = ['---'];
  lines.push(`title: "${sanitizeYamlString(data.title)}"`);
  lines.push(`description: "${sanitizeYamlString(data.description)}"`);
  if (data.pubDate) lines.push(`pubDate: ${data.pubDate}`);
  if (data.updatedDate && data.updatedDate !== data.pubDate) {
    lines.push(`updatedDate: ${data.updatedDate}`);
  }
  if (data.category) lines.push(`category: "${sanitizeYamlString(data.category)}"`);
  if (data.tags && data.tags.length > 0) {
    lines.push(`tags: [${data.tags.map(t => `"${sanitizeYamlString(t)}"`).join(', ')}]`);
  }
  if (data.image) lines.push(`image: "${data.image}"`);
  lines.push(`draft: false`);
  lines.push('---');
  return lines.join('\n');
}

function ensureUnique(slug, used) {
  if (!used.has(slug)) {
    used.add(slug);
    return slug;
  }
  let i = 2;
  while (used.has(`${slug}-${i}`)) i++;
  const unique = `${slug}-${i}`;
  used.add(unique);
  return unique;
}

// --- Hlavní logika ---

async function main() {
  console.log(`\n📂 Načítám XML: ${XML_FILE}\n`);
  const xml = fs.readFileSync(XML_FILE, 'utf-8');
  const parsed = await parseStringPromise(xml, { explicitArray: true });

  const channel = parsed?.rss?.channel?.[0];
  if (!channel) {
    console.error('❌ Nepodařilo se načíst channel z XML.');
    process.exit(1);
  }

  const items = channel.item || [];
  console.log(`📝 Nalezeno ${items.length} položek celkem.\n`);

  // Namespace helpery
  const ns = {
    content: (item) => item['content:encoded']?.[0] || '',
    excerpt: (item) => item['excerpt:encoded']?.[0] || '',
    wpStatus: (item) => item['wp:status']?.[0] || '',
    wpType: (item) => item['wp:post_type']?.[0] || '',
    wpDate: (item) => item['wp:post_date']?.[0] || '',
    wpModified: (item) => item['wp:post_modified']?.[0] || '',
  };

  const stats = {
    blog: 0,
    pages: 0,
    skipped: 0,
    warnings: [],
  };

  const usedBlogSlugs = new Set();
  const usedPageSlugs = new Set();

  // Rezervované Astro stránky — přeskočit (budou v src/pages/)
  const RESERVED_SLUGS = new Set(['blog', 'kontakt', 'o-mne', 'sluzby', '404']);

  for (const item of items) {
    const status = ns.wpStatus(item);
    const type = ns.wpType(item);

    // Přeskočit nepublikované
    if (status !== 'publish') {
      stats.skipped++;
      continue;
    }

    // Zpracovat pouze posts a pages
    if (type !== 'post' && type !== 'page') {
      stats.skipped++;
      continue;
    }

    const title = item.title?.[0] || 'Bez názvu';
    const link = item.link?.[0] || '';
    const rawSlug = slugFromUrl(link);
    const content = ns.content(item);
    const excerpt = ns.excerpt(item);
    const pubDate = wpDateToISO(ns.wpDate(item));
    const modDate = wpDateToISO(ns.wpModified(item));

    // Kategorie a tagy
    const categories = [];
    const tags = [];
    if (item.category) {
      for (const cat of item.category) {
        const domain = cat.$.domain;
        const val = typeof cat === 'string' ? cat : cat._ || '';
        if (domain === 'category' && val) categories.push(val);
        if (domain === 'post_tag' && val) tags.push(val);
      }
    }

    // Popis — z excerpt nebo začátek obsahu
    let description = htmlToMarkdown(excerpt).replace(/\n/g, ' ').slice(0, 160);
    if (!description) {
      description = htmlToMarkdown(content).replace(/\n/g, ' ').slice(0, 160);
    }

    const markdown = htmlToMarkdown(content);
    const isEmpty = !markdown.trim();

    if (isEmpty) {
      stats.warnings.push(`⚠️  Prázdný obsah: "${title}" (${rawSlug})`);
    }

    if (type === 'post') {
      const slug = ensureUnique(rawSlug, usedBlogSlugs);
      const fm = buildFrontmatter({
        title,
        description,
        pubDate,
        updatedDate: modDate,
        category: categories[0] || '',
        tags,
      });
      const outPath = path.join(BLOG_DIR, `${slug}.md`);
      fs.writeFileSync(outPath, `${fm}\n\n${markdown}\n`, 'utf-8');
      stats.blog++;

    } else if (type === 'page') {
      if (RESERVED_SLUGS.has(rawSlug)) {
        stats.skipped++;
        console.log(`   ⏭️  Přeskakuji rezervovaný slug: ${rawSlug}`);
        continue;
      }
      const slug = ensureUnique(rawSlug, usedPageSlugs);
      const fm = buildFrontmatter({
        title,
        description,
        pubDate,
      });
      const outPath = path.join(PAGES_DIR, `${slug}.md`);
      fs.writeFileSync(outPath, `${fm}\n\n${markdown}\n`, 'utf-8');
      stats.pages++;
    }
  }

  // --- Report ---
  console.log('═══════════════════════════════════════');
  console.log('✅ MIGRACE DOKONČENA');
  console.log('═══════════════════════════════════════');
  console.log(`   📰 Články (blog):    ${stats.blog}`);
  console.log(`   📄 Stránky (pages): ${stats.pages}`);
  console.log(`   ⏭️  Přeskočeno:      ${stats.skipped}`);
  console.log('');
  if (stats.warnings.length > 0) {
    console.log('VAROVÁNÍ:');
    stats.warnings.forEach(w => console.log(`   ${w}`));
  }
  console.log('');
}

main().catch(err => {
  console.error('❌ Chyba:', err.message);
  process.exit(1);
});
