import https from 'https';
import { sleep } from './utils.mjs';

const BASE_URL = 'https://export.arxiv.org/api/query';

/**
 * Search arXiv
 * @param {string} query - Search query
 * @param {number} limit - Max results (default 10)
 * @param {string} sortBy - relevance | lastUpdatedDate | submittedDate
 * @param {string} category - arXiv category e.g. cs.LG
 */
export async function searchArxiv(query, limit = 10, sortBy = 'relevance', category = null) {
  let searchQuery = `all:${encodeURIComponent(query)}`;
  if (category) searchQuery += `+cat:${category}`;
  
  const url = `${BASE_URL}?search_query=${searchQuery}&start=0&max_results=${limit}&sortBy=${sortBy}&sortOrder=descending`;
  
  // arXiv API recommends 3 seconds between requests; use 5s to be safe
  await sleep(5000);
  
  const result = await httpsGetWithRetry(url, 3, 5000);
  return parseArxivXml(result.data);
}

function httpsGetWithRetry(url, maxRetries = 3, baseDelay = 5000) {
  return new Promise(async (resolve, reject) => {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await doHttpsGet(url);
        return resolve(result);
      } catch (err) {
        lastError = err;
        const isRateLimit = err.statusCode === 429 || err.statusCode === 503;
        if (isRateLimit && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          console.log(`[arXiv Rate Limit] ${err.statusCode}. Retrying in ${delay}ms... (${attempt + 1}/${maxRetries})`);
          await sleep(delay);
          continue;
        }
        return reject(err);
      }
    }
    reject(lastError);
  });
}

function doHttpsGet(url, maxRedirects = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const statusCode = res.statusCode;
      
      // Handle redirects
      if ((statusCode === 301 || statusCode === 302) && res.headers.location && maxRedirects > 0) {
        return doHttpsGet(res.headers.location, maxRedirects - 1).then(resolve).catch(reject);
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (statusCode >= 400) {
          const err = new Error(`HTTP ${statusCode}: ${data.slice(0, 200)}`);
          err.statusCode = statusCode;
          return reject(err);
        }
        resolve({ data });
      });
    }).on('error', reject);
  });
}

/**
 * Parse arXiv Atom XML to JSON
 */
function parseArxivXml(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  
  while ((match = entryRegex.exec(xml)) !== null) {
    const entryXml = match[1];
    entries.push({
      title: extractTag(entryXml, 'title'),
      authors: extractAuthors(entryXml),
      summary: extractTag(entryXml, 'summary'),
      published: extractTag(entryXml, 'published')?.slice(0, 4),
      updated: extractTag(entryXml, 'updated'),
      doi: extractTag(entryXml, 'doi'),
      arxivId: extractArxivId(entryXml),
      pdf: extractPdf(entryXml),
      primaryCategory: extractAttribute(entryXml, 'arxiv:primary_category', 'term'),
      categories: extractCategories(entryXml),
      source: 'arXiv'
    });
  }
  
  return entries;
}

function extractTag(xml, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : undefined;
}

function extractAuthors(xml) {
  const authors = [];
  const authorRegex = /<author>([\s\S]*?)<\/author>/g;
  let match;
  while ((match = authorRegex.exec(xml)) !== null) {
    const name = extractTag(match[1], 'name');
    if (name) authors.push({ name });
  }
  return authors;
}

function extractArxivId(xml) {
  const idTag = extractTag(xml, 'id');
  if (idTag) {
    const match = idTag.match(/arxiv\.org\/abs\/(.+)/);
    return match ? match[1] : idTag;
  }
  return undefined;
}

function extractPdf(xml) {
  const linkRegex = /<link[^>]*title="pdf"[^>]*href="([^"]+)"[^>]*\/>/;
  const match = xml.match(linkRegex);
  if (match) return match[1];
  
  // Alternative format
  const linkRegex2 = /<link[^>]*href="([^"]+)"[^>]*type="application\/pdf"[^>]*\/>/;
  const match2 = xml.match(linkRegex2);
  if (match2) return match2[1];
  
  // Try to construct from arxivId
  const arxivId = extractArxivId(xml);
  if (arxivId) return `https://arxiv.org/pdf/${arxivId}.pdf`;
  
  return undefined;
}

function extractAttribute(xml, tagName, attrName) {
  const regex = new RegExp(`<${tagName.replace(':', '\\:')}[^>]*${attrName}="([^"]+)"`);
  const match = xml.match(regex);
  return match ? match[1] : undefined;
}

function extractCategories(xml) {
  const categories = [];
  const catRegex = /<category[^>]*term="([^"]+)"/g;
  let match;
  while ((match = catRegex.exec(xml)) !== null) {
    categories.push(match[1]);
  }
  return categories;
}
