export const SOURCE_LABELS = {
  openalex: 'OpenAlex',
  semantic: 'SemanticScholar',
  pubmed: 'PubMed',
  arxiv: 'arXiv'
};

const DEFAULT_SOURCE_ORDER = ['openalex', 'semantic', 'pubmed', 'arxiv'];

export function parseMultiSources(value) {
  if (!value) return [...DEFAULT_SOURCE_ORDER];

  const aliases = {
    openalex: 'openalex',
    semantic: 'semantic',
    semanticscholar: 'semantic',
    s2: 'semantic',
    pubmed: 'pubmed',
    arxiv: 'arxiv'
  };
  const selected = String(value)
    .split(',')
    .map(value => aliases[value.trim().toLowerCase()])
    .filter(Boolean);
  const unique = [...new Set(selected)];
  if (unique.length === 0) {
    throw new Error('No valid multi sources. Use: openalex,semantic,pubmed,arxiv');
  }
  return unique;
}

export function interleaveAndMerge(sourceResults, selectedSources) {
  const papers = [];
  const keyMap = new Map();
  const maxDepth = Math.max(0, ...selectedSources.map(id => sourceResults[id]?.length || 0));

  for (let rank = 0; rank < maxDepth; rank++) {
    for (const sourceId of selectedSources) {
      const incoming = sourceResults[sourceId]?.[rank];
      if (!incoming) continue;

      const incomingKeys = getPaperKeys(incoming);
      let paper = incomingKeys.map(key => keyMap.get(key)).find(Boolean);
      if (!paper) {
        paper = mergePaper({}, incoming, SOURCE_LABELS[sourceId]);
        papers.push(paper);
      } else {
        mergePaper(paper, incoming, SOURCE_LABELS[sourceId]);
      }

      for (const key of getPaperKeys(paper)) keyMap.set(key, paper);
    }
  }

  return papers;
}

function getPaperKeys(paper) {
  const keys = [];
  const doi = normalizeDoi(paper.doi);
  const title = normalizeTitle(paper.title);
  if (doi) keys.push(`doi:${doi}`);
  if (paper.pmid) keys.push(`pmid:${String(paper.pmid).trim()}`);
  if (paper.arxivId) keys.push(`arxiv:${String(paper.arxivId).toLowerCase().replace(/v\d+$/, '')}`);
  if (title) keys.push(`title:${title}`);
  return keys;
}

export function normalizeDoi(value) {
  if (!value) return undefined;
  let doi = String(value).trim();
  try { doi = decodeURIComponent(doi); } catch { /* keep original */ }
  doi = doi
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim()
    .toLowerCase();
  return doi.startsWith('10.') ? doi : undefined;
}

function normalizeTitle(value) {
  if (!value) return '';
  return String(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function mergePaper(target, incoming, sourceName) {
  const fields = [
    'title', 'year', 'venue', 'doi', 'id', 'pmid', 'pmcid', 'arxivId',
    'pdf', 'url', 'fullTextUrl', 'primaryCategory', 'categories', 'published',
    'updated', 'pubdate', 'volume', 'issue', 'pages', 'lang', 'license', 'oa_status'
  ];

  for (const field of fields) {
    if (!hasValue(target[field]) && hasValue(incoming[field])) target[field] = incoming[field];
  }

  if (hasValue(incoming.abstract) &&
      (!hasValue(target.abstract) || String(incoming.abstract).length > String(target.abstract).length)) {
    target.abstract = incoming.abstract;
  }

  if (Array.isArray(incoming.authors) &&
      (!Array.isArray(target.authors) || incoming.authors.length > target.authors.length)) {
    target.authors = incoming.authors;
  }

  const citationCounts = [target.citations, target.citationCount, target.cited_by_count,
    incoming.citations, incoming.citationCount, incoming.cited_by_count]
    .filter(Number.isFinite);
  if (citationCounts.length > 0) target.citations = Math.max(...citationCounts);

  const referenceCounts = [target.references_count, target.referenceCount,
    incoming.references_count, incoming.referenceCount]
    .filter(Number.isFinite);
  if (referenceCounts.length > 0) target.references_count = Math.max(...referenceCounts);

  target.is_oa = Boolean(target.is_oa || incoming.is_oa || incoming.pdf || incoming.fullTextUrl);
  const sources = [
    ...(Array.isArray(target.sources) ? target.sources : []),
    ...(Array.isArray(incoming.sources) ? incoming.sources : []),
    sourceName,
    incoming.source
  ].filter(Boolean);
  target.sources = [...new Set(sources)];
  target.source = target.sources.join('+');
  return target;
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

export function finalizePaper(paper) {
  const doi = normalizeDoi(paper.doi);
  const fullTextLinks = [
    paper.pdf,
    paper.fullTextUrl,
    paper.pmcid ? `https://pmc.ncbi.nlm.nih.gov/articles/${paper.pmcid}/` : undefined,
    paper.arxivId ? `https://arxiv.org/pdf/${paper.arxivId}` : undefined
  ].filter(Boolean);

  return {
    ...paper,
    doi: doi || paper.doi,
    doiUrl: doi ? `https://doi.org/${doi}` : undefined,
    fullTextLinks: [...new Set(fullTextLinks)],
    openAccessStatus: fullTextLinks.length > 0 ? 'link_available' : 'unknown_or_paywalled'
  };
}
