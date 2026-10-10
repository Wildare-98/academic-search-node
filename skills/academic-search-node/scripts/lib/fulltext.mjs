import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { getOpenAlexWork } from './openalex.mjs';
import { getSemanticPaper } from './semantic-scholar.mjs';
import { getPubmedArticle } from './pubmed.mjs';
import { normalizeDoi } from './multi.mjs';
import { sleep } from './utils.mjs';

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const USER_AGENT = 'AcademicSearch/1.1 (open-access full-text fetcher)';

export async function fetchFullText(options = {}) {
  const outputDir = path.resolve(options.outputDir || 'fulltext');
  const maxFiles = positiveInteger(options.maxFiles, Number.MAX_SAFE_INTEGER);
  const maxBytes = positiveInteger(options.maxBytes, DEFAULT_MAX_BYTES);
  const delay = Math.max(0, Number(options.delay || 0));
  const overwrite = Boolean(options.overwrite);
  const papers = loadPapers(options).slice(0, maxFiles);

  fs.mkdirSync(outputDir, { recursive: true });
  const items = [];

  for (let i = 0; i < papers.length; i++) {
    const paper = normalizePaperInput(papers[i]);
    const label = paper.title || paper.doi || paper.pmcid || paper.pmid || paper.arxivId || paper.input || 'paper';
    console.log(`[FullText ${i + 1}/${papers.length}] ${label}`);
    const item = await fetchOnePaper(paper, i, { outputDir, maxBytes, overwrite });
    items.push(item);
    if (delay > 0 && i < papers.length - 1) await sleep(delay);
  }

  const summary = {
    total: items.length,
    downloaded: items.filter(item => item.status === 'downloaded').length,
    existing: items.filter(item => item.status === 'existing').length,
    unavailable: items.filter(item => item.status === 'unavailable').length
  };
  const manifestPath = path.join(outputDir, options.manifestName || 'fetch-manifest.json');
  const report = {
    createdAt: new Date().toISOString(),
    inputFile: options.inputFile ? path.resolve(options.inputFile) : undefined,
    outputDir,
    summary,
    items
  };
  fs.writeFileSync(manifestPath, JSON.stringify(report, null, 2), 'utf-8');
  return { ...report, manifestPath };
}

function loadPapers(options) {
  if (options.inputFile) {
    const inputPath = path.resolve(options.inputFile);
    const parsed = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.results)) return parsed.results;
    if (Array.isArray(parsed.items)) return parsed.items;
    throw new Error('Input JSON must be an array or contain a results/items array');
  }
  if (!options.target) throw new Error('Provide a URL/identifier or --input <results.json>');
  return [parseTarget(options.target)];
}

function normalizePaperInput(value) {
  if (typeof value === 'string') return parseTarget(value);
  if (!value || typeof value !== 'object') throw new Error('Invalid paper record in input JSON');
  return { ...value };
}

function parseTarget(value) {
  const input = String(value).trim();
  const doi = normalizeDoi(input);
  if (doi) return { input, doi };

  const pmcid = input.match(/^PMC\s*:?\s*(\d+)$/i);
  if (pmcid) return { input, pmcid: `PMC${pmcid[1]}` };

  const pmid = input.match(/^PMID\s*:?\s*(\d+)$/i);
  if (pmid) return { input, pmid: pmid[1] };
  if (/^\d{6,9}$/.test(input)) return { input, pmid: input };

  const arxiv = input.match(/^(?:arxiv\s*:?\s*)?([a-z-]+(?:\.[a-z-]+)?\/\d{7}|\d{4}\.\d{4,5}(?:v\d+)?)$/i);
  if (arxiv) return { input, arxivId: arxiv[1] };

  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input);
    const pmcFromUrl = url.pathname.match(/articles\/(PMC\d+)/i);
    return {
      input,
      title: decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || url.hostname),
      pmcid: pmcFromUrl?.[1]?.toUpperCase(),
      fullTextLinks: [input]
    };
  }
  throw new Error(`Unsupported identifier: ${input}`);
}

async function fetchOnePaper(originalPaper, index, options) {
  let paper = { ...originalPaper };
  const attempts = [];
  let candidates = directCandidates(paper);
  let result = await tryCandidates(candidates, paper, index, options, attempts);
  if (result) return result;

  const resolved = await resolveAdditionalCandidates(paper, attempts);
  paper = resolved.paper;
  candidates = resolved.candidates.filter(candidate => !candidates.some(existing => existing.url === candidate.url));
  result = await tryCandidates(candidates, paper, index, options, attempts);
  if (result) return result;

  return {
    index: index + 1,
    title: paper.title,
    doi: normalizeDoi(paper.doi),
    pmid: paper.pmid,
    pmcid: paper.pmcid,
    arxivId: paper.arxivId,
    status: 'unavailable',
    reason: attempts.length > 0 ? 'No verified open full text could be downloaded' : 'No open full-text link found',
    attempts
  };
}

function directCandidates(paper) {
  const links = [
    ...(Array.isArray(paper.fullTextLinks) ? paper.fullTextLinks : []),
    paper.pdf,
    paper.fullTextUrl,
    paper.arxivId ? `https://arxiv.org/pdf/${paper.arxivId}` : undefined,
    paper.pmcid ? `https://pmc.ncbi.nlm.nih.gov/articles/${paper.pmcid}/` : undefined
  ].filter(Boolean);
  return uniqueCandidates(links.flatMap(expandKnownUrl));
}

function expandKnownUrl(value) {
  let url;
  try { url = new URL(String(value)); } catch { return []; }
  if (!['http:', 'https:'].includes(url.protocol)) return [];

  const pmcid = url.href.match(/PMC\d+/i)?.[0]?.toUpperCase();
  if (pmcid) {
    return [
      { url: `https://europepmc.org/articles/${pmcid}?pdf=render`, kind: 'pmc-pdf' },
      { url: `https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`, kind: 'pmc-xml' },
      { url: url.href, kind: 'pmc-html' }
    ];
  }

  if (/arxiv\.org\/abs\//i.test(url.href)) {
    return [{ url: url.href.replace('/abs/', '/pdf/'), kind: 'arxiv-pdf' }];
  }
  if (/^(?:dx\.)?doi\.org$/i.test(url.hostname)) return [];
  return [{ url: url.href, kind: 'direct' }];
}

async function resolveAdditionalCandidates(paper, attempts) {
  const resolved = { ...paper };
  const links = [];

  if (resolved.pmid && !resolved.pmcid) {
    try {
      const pubmed = await getPubmedArticle(String(resolved.pmid));
      mergeMetadata(resolved, pubmed);
    } catch (error) {
      attempts.push({ resolver: 'PubMed', error: error.message });
    }
  }

  const doi = normalizeDoi(resolved.doi);
  if (doi) {
    const [openAlex, semantic] = await Promise.allSettled([
      getOpenAlexWork(doi),
      getSemanticPaper(doi)
    ]);
    if (openAlex.status === 'fulfilled') {
      mergeMetadata(resolved, openAlex.value);
      if (openAlex.value.pdf) links.push(openAlex.value.pdf);
      if (openAlex.value.is_oa && openAlex.value.url) links.push(openAlex.value.url);
    } else {
      attempts.push({ resolver: 'OpenAlex', error: openAlex.reason?.message || String(openAlex.reason) });
    }
    if (semantic.status === 'fulfilled') {
      mergeMetadata(resolved, semantic.value);
      if (semantic.value.pdf) links.push(semantic.value.pdf);
    } else {
      attempts.push({ resolver: 'SemanticScholar', error: semantic.reason?.message || String(semantic.reason) });
    }
  }

  if (resolved.pmcid) links.push(`https://pmc.ncbi.nlm.nih.gov/articles/${resolved.pmcid}/`);
  if (resolved.arxivId) links.push(`https://arxiv.org/pdf/${resolved.arxivId}`);
  return { paper: resolved, candidates: uniqueCandidates(links.flatMap(expandKnownUrl)) };
}

function mergeMetadata(target, incoming) {
  if (!incoming) return target;
  for (const field of ['title', 'doi', 'pmid', 'pmcid', 'arxivId', 'pdf', 'fullTextUrl', 'url']) {
    if (!target[field] && incoming[field]) target[field] = incoming[field];
  }
  return target;
}

async function tryCandidates(candidates, paper, index, options, attempts) {
  for (const candidate of candidates) {
    try {
      const downloaded = await downloadCandidate(candidate, options.maxBytes);
      const baseName = makeBaseName(index, paper);
      const filePath = path.join(options.outputDir, `${baseName}.${downloaded.extension}`);
      const status = fs.existsSync(filePath) && !options.overwrite ? 'existing' : 'downloaded';
      if (status === 'downloaded') fs.writeFileSync(filePath, downloaded.buffer);
      return {
        index: index + 1,
        title: paper.title,
        doi: normalizeDoi(paper.doi),
        pmid: paper.pmid,
        pmcid: paper.pmcid,
        arxivId: paper.arxivId,
        status,
        sourceUrl: candidate.url,
        finalUrl: downloaded.finalUrl,
        filePath,
        format: downloaded.extension,
        contentType: downloaded.contentType,
        bytes: downloaded.buffer.length,
        attempts
      };
    } catch (error) {
      attempts.push({ url: candidate.url, kind: candidate.kind, error: error.message });
    }
  }
  return null;
}

async function downloadCandidate(candidate, maxBytes) {
  const response = await requestWithRetry(candidate.url, maxBytes);
  const detected = detectContent(response.buffer, response.contentType, response.finalUrl);
  validateFullText(detected, response.buffer, response.finalUrl);
  return { ...response, extension: detected };
}

async function requestWithRetry(url, maxBytes, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await requestBuffer(url, maxBytes);
    } catch (error) {
      lastError = error;
      if (![429, 503].includes(error.statusCode) || attempt === maxRetries) throw error;
      await sleep(1000 * Math.pow(2, attempt));
    }
  }
  throw lastError;
}

function requestBuffer(url, maxBytes, redirects = 5) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch { return reject(new Error('Invalid URL')); }
    if (!['http:', 'https:'].includes(parsed.protocol)) return reject(new Error('Only HTTP(S) URLs are allowed'));
    const client = parsed.protocol === 'https:' ? https : http;
    const request = client.get(parsed, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/pdf, application/xml, text/xml, text/html;q=0.9, */*;q=0.5',
        'Accept-Encoding': 'identity'
      }
    }, response => {
      const statusCode = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location) {
        response.resume();
        if (redirects <= 0) return reject(new Error('Too many redirects'));
        const nextUrl = new URL(response.headers.location, parsed).href;
        return requestBuffer(nextUrl, maxBytes, redirects - 1).then(resolve, reject);
      }
      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        const error = new Error(`HTTP ${statusCode}`);
        error.statusCode = statusCode;
        return reject(error);
      }

      const declaredLength = Number(response.headers['content-length'] || 0);
      if (declaredLength > maxBytes) {
        response.resume();
        return reject(new Error(`File exceeds ${Math.round(maxBytes / 1024 / 1024)} MB limit`));
      }

      const chunks = [];
      let total = 0;
      response.on('data', chunk => {
        total += chunk.length;
        if (total > maxBytes) {
          response.destroy(new Error(`File exceeds ${Math.round(maxBytes / 1024 / 1024)} MB limit`));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        finalUrl: parsed.href,
        contentType: String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
      }));
      response.on('error', reject);
    });
    request.setTimeout(30000, () => request.destroy(new Error('Request timed out after 30 seconds')));
    request.on('error', reject);
  });
}

function detectContent(buffer, contentType, url) {
  const prefix = buffer.subarray(0, 32).toString('latin1');
  const textPrefix = buffer.subarray(0, 1024).toString('utf-8').trimStart().toLowerCase();
  if (prefix.startsWith('%PDF-')) return 'pdf';
  if (contentType.includes('xml') || textPrefix.startsWith('<?xml')) return 'xml';
  if (contentType.includes('html') || textPrefix.startsWith('<!doctype html') || textPrefix.startsWith('<html')) return 'html';
  if (contentType.startsWith('text/')) return 'txt';
  if (/\.pdf(?:$|\?)/i.test(url)) throw new Error('Expected PDF but received unsupported content');
  throw new Error(`Unsupported content type: ${contentType || 'unknown'}`);
}

function validateFullText(format, buffer, url) {
  if (format === 'pdf') return;
  const text = buffer.toString('utf-8');
  if (/checking your browser|recaptcha|access denied/i.test(text)) {
    throw new Error('Access challenge page received instead of full text');
  }
  if (format === 'xml') {
    if (/<article[\s>]/i.test(text) && /<body[\s>]/i.test(text)) return;
    throw new Error('XML does not look like a full article');
  }
  if (format === 'html') {
    const likelyArticle = /<article[\s>]/i.test(text) || /article[-_ ]body/i.test(text) || /full[-_ ]text/i.test(text);
    if (text.length >= 10000 && likelyArticle) return;
    throw new Error(`HTML page is not verified full text: ${url}`);
  }
  if (format === 'txt' && text.length >= 5000) return;
  throw new Error('Text response is too short to be a full article');
}

function makeBaseName(index, paper) {
  const label = paper.title || paper.doi || paper.pmcid || paper.pmid || paper.arxivId || paper.input || 'paper';
  const clean = String(label)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 120) || 'paper';
  return `${String(index + 1).padStart(3, '0')}_${clean}`;
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  return candidates.filter(candidate => {
    if (!candidate?.url || seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
