import { httpGet } from './utils.mjs';

const BASE_URL = 'https://api.openalex.org';

/**
 * Search OpenAlex
 */
export async function searchOpenAlex(query, limit = 10, year = null) {
  const encoded = encodeURIComponent(query);
  let url = `${BASE_URL}/works?search=${encoded}&per-page=${limit}`;
  if (year) url += `&filter=publication_year:${year}`;

  const result = await httpGet(url, {
    headers: { 'User-Agent': 'mailto:user@example.com' }
  });

  return (result.data.results || []).map(r => normalizeWork(r));
}

/**
 * Get work by OpenAlex ID or DOI
 */
export async function getOpenAlexWork(idOrDoi) {
  const path = idOrDoi.startsWith('10.') ? `doi:${idOrDoi}` : idOrDoi;
  const url = `${BASE_URL}/works/${path}`;
  const result = await httpGet(url, {
    headers: { 'User-Agent': 'mailto:user@example.com' }
  });
  return normalizeWork(result.data);
}

function normalizeWork(r) {
  return {
    title: r.display_name || r.title,
    authors: (r.authorships || []).map(a => ({ name: a.author?.display_name })),
    year: r.publication_year,
    venue: r.primary_location?.source?.display_name || r.host_venue?.display_name,
    doi: r.doi,
    cited_by_count: r.cited_by_count,
    abstract: reconstructAbstract(r.abstract_inverted_index) || r.abstract,
    pdf: r.best_oa_location?.pdf_url || r.primary_location?.pdf_url,
    url: r.best_oa_location?.landing_page_url || r.primary_location?.landing_page_url,
    is_oa: Boolean(r.open_access?.is_oa),
    oa_status: r.open_access?.oa_status,
    license: r.best_oa_location?.license || r.primary_location?.license,
    id: r.id,
    source: 'OpenAlex'
  };
}

function reconstructAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== 'object') return undefined;
  const words = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const position of positions || []) {
      if (Number.isInteger(position) && position >= 0) words[position] = word;
    }
  }
  return words.length > 0 ? words.filter(Boolean).join(' ') : undefined;
}
