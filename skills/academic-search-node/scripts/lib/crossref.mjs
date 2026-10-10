import { httpGet } from './utils.mjs';

const BASE_URL = 'https://api.crossref.org';

/**
 * Get work by DOI
 */
export async function searchCrossref(doi) {
  const url = `${BASE_URL}/works/${encodeURIComponent(doi)}`;
  const result = await httpGet(url, {
    headers: { 'User-Agent': 'AcademicSearch/1.0 (mailto:user@example.com)' }
  });
  
  const m = result.data.message || {};
  return {
    title: m.title?.[0],
    authors: (m.author || []).map(a => ({ name: `${a.given || ''} ${a.family || ''}`.trim(), given: a.given, family: a.family })),
    year: m.published?.['date-parts']?.[0]?.[0] || m['published-print']?.['date-parts']?.[0]?.[0],
    venue: m['container-title']?.[0] || m['short-container-title']?.[0],
    doi: m.DOI,
    cited_by_count: m['is-referenced-by-count'],
    abstract: m.abstract,
    references_count: m['references-count'],
    url: m.URL,
    source: 'Crossref'
  };
}
