import { httpGet, getApiKey, sleep } from './utils.mjs';

const BASE_URL = 'https://api.semanticscholar.org';
const S2_API_KEY = getApiKey('SEMANTIC_SCHOLAR_API_KEY');

function getHeaders() {
  const h = { 'User-Agent': 'AcademicSearch/1.0' };
  if (S2_API_KEY) h['x-api-key'] = S2_API_KEY;
  return h;
}


/**
 * Search Semantic Scholar
 */
export async function searchSemantic(query, limit = 10, minCitations = null) {
  const fields = 'paperId,title,authors,year,abstract,venue,externalIds,citationCount,referenceCount,publicationTypes,openAccessPdf';
  let url = `${BASE_URL}/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&limit=${limit}`;
  if (minCitations) url += `&minCitationCount=${minCitations}`;

  const result = await httpGet(url, { headers: getHeaders() });
  return (result.data.data || []).map(normalizePaper);
}

/**
 * Get paper by S2 ID or DOI
 */
export async function getSemanticPaper(idOrDoi) {
  const prefix = idOrDoi.startsWith('10.') ? 'DOI:' : '';
  const fields = 'paperId,title,authors,year,abstract,venue,externalIds,citationCount,referenceCount,tldr,openAccessPdf,fieldsOfStudy,publicationDate';
  const url = `${BASE_URL}/graph/v1/paper/${prefix}${idOrDoi}?fields=${encodeURIComponent(fields)}`;

  const result = await httpGet(url, { headers: getHeaders() });
  return normalizePaper(result.data);
}

function normalizePaper(p) {
  return {
    title: p.title,
    authors: (p.authors || []).map(a => ({ name: a.name })),
    year: p.year,
    venue: p.venue,
    doi: p.externalIds?.DOI,
    citationCount: p.citationCount,
    referenceCount: p.referenceCount,
    abstract: p.abstract || p.tldr?.text,
    pdf: p.openAccessPdf?.url,
    id: p.paperId,
    source: 'SemanticScholar'
  };
}

export { S2_API_KEY };
