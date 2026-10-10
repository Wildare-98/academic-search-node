import { httpGet, sleep } from './utils.mjs';

const EUTILS_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

/**
 * Search PubMed
 * @param {string} query - Search query
 * @param {number} limit - Max results (default 10)
 * @param {string} sort - Sort order: relevance | pub+date
 */
export async function searchPubmed(query, limit = 10, sort = 'relevance') {
  // Step 1: Search for PMIDs
  const searchUrl = `${EUTILS_URL}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retmax=${limit}&sort=${sort}`;
  const searchResult = await httpGet(searchUrl);
  const pmids = searchResult.data.esearchresult?.idlist || [];

  if (pmids.length === 0) return [];

  // Step 2: Fetch summaries for PMIDs
  const summaryUrl = `${EUTILS_URL}/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json`;
  const summaryResult = await httpGet(summaryUrl);
  const articles = summaryResult.data.result || {};

  return pmids.map(pmid => normalizePubmedArticle(articles[pmid], pmid)).filter(Boolean);
}

/**
 * Get article by PMID
 */
export async function getPubmedArticle(pmid) {
  const summaryUrl = `${EUTILS_URL}/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`;
  const result = await httpGet(summaryUrl);
  const articles = result.data.result || {};
  return normalizePubmedArticle(articles[pmid], pmid);
}

function normalizePubmedArticle(article, pmid) {
  if (!article || article.error) return null;

  const authors = (article.authors || []).map(a => ({
    name: a.name,
    authtype: a.authtype
  }));
  const pmcid = article.articleids?.find(id => id.idtype === 'pmc')?.value;

  return {
    title: article.title,
    authors,
    year: article.pubdate?.match(/\d{4}/)?.[0],
    pubdate: article.pubdate,
    venue: article.fulljournalname || article.source,
    doi: article.articleids?.find(id => id.idtype === 'doi')?.value,
    pmid: pmid,
    pmcid,
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    fullTextUrl: pmcid ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/` : undefined,
    volume: article.volume,
    issue: article.issue,
    pages: article.pages,
    abstract: article.abstract || undefined,
    lang: article.lang?.[0],
    source: 'PubMed'
  };
}
