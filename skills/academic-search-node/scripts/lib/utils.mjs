import https from 'https';
import { execSync } from 'child_process';

/**
 * Sleep for ms milliseconds
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Read API Key from env or Windows registry
 */
export function getApiKey(envName) {
  if (process.env[envName]) {
    return process.env[envName];
  }
  try {
    const regOutput = execSync(
      `reg query "HKCU\\Environment" /v ${envName}`,
      { encoding: 'utf-8', windowsHide: true }
    );
    const match = regOutput.match(new RegExp(`${envName}\\s+REG_SZ\\s+(.+)\\r?\\n`));
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Generic HTTPS GET request with retry logic
 */
export function httpGet(url, options = {}, maxRetries = 3, baseDelayMs = 2000) {
  return new Promise(async (resolve, reject) => {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await doHttpGet(url, options);
        return resolve(result);
      } catch (err) {
        lastError = err;
        const isRateLimit = err.statusCode === 429;
        if (isRateLimit && attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          console.log(`[Rate Limit] 429. Retrying in ${delay}ms... (${attempt + 1}/${maxRetries})`);
          await sleep(delay);
          continue;
        }
        return reject(err);
      }
    }
    reject(lastError);
  });
}

function doHttpGet(url, options) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    https.get(url, options, (res) => {
      const statusCode = res.statusCode;
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const elapsed = Date.now() - startTime;
        if (statusCode >= 400) {
          const err = new Error(`HTTP ${statusCode}: ${data.slice(0, 200)}`);
          err.statusCode = statusCode;
          err.headers = res.headers;
          return reject(err);
        }
        try {
          const json = JSON.parse(data);
          resolve({ data: json, headers: res.headers, elapsed });
        } catch {
          resolve({ data, headers: res.headers, elapsed });
        }
      });
    }).on('error', reject);
  });
}

/**
 * Format paper object to text
 */
export function formatPaper(p, source) {
  const lines = [];
  lines.push(`Title: ${p.title || 'N/A'}`);
  if (p.authors && p.authors.length > 0) {
    const authorStr = p.authors.map(a => a.name || `${a.given || ''} ${a.family || ''}`.trim()).filter(Boolean).join(', ');
    lines.push(`Authors: ${authorStr}`);
  }
  if (p.year || p.publication_year) {
    lines.push(`Year: ${p.year || p.publication_year}`);
  }
  if (p.venue || p.journal || p.primary_location?.source?.display_name) {
    lines.push(`Venue: ${p.venue || p.journal || p.primary_location?.source?.display_name || 'N/A'}`);
  }
  if (p.doi || p.externalIds?.DOI) {
    lines.push(`DOI: ${p.doi || p.externalIds?.DOI}`);
  }

  // arXiv specific
  if (p.arxivId) {
    lines.push(`arXiv ID: ${p.arxivId}`);
  }
  if (p.pdf) {
    lines.push(`PDF: ${p.pdf}`);
  }
  const fullTextLinks = [
    ...(Array.isArray(p.fullTextLinks) ? p.fullTextLinks : []),
    p.fullTextUrl
  ].filter(link => link && link !== p.pdf);
  for (const link of [...new Set(fullTextLinks)]) lines.push(`Full text: ${link}`);

  if (p.primaryCategory) {
    lines.push(`Category: ${p.primaryCategory}`);
  }

  // PubMed specific
  if (p.pmid) {
    lines.push(`PMID: ${p.pmid}`);
  }
  if (p.pmcid) {
    lines.push(`PMCID: ${p.pmcid}`);
  }
  if (p.volume) {
    lines.push(`Volume/Issue: ${p.volume}${p.issue ? '(' + p.issue + ')' : ''}${p.pages ? ', ' + p.pages : ''}`);
  }

  if (p.citations !== undefined || p.citationCount !== undefined || p.cited_by_count !== undefined) {
    lines.push(`Citations: ${p.citations ?? p.citationCount ?? p.cited_by_count ?? 0}`);
  }
  if (p.abstract) {
    lines.push(`Abstract: ${p.abstract.slice(0, 400)}${p.abstract.length > 400 ? '...' : ''}`);
  }
  lines.push(`Source: ${source}`);
  return lines.join('\n');
}

/**
 * Parse CLI arguments
 */
export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(arg);
    }
  }
  return args;
}
