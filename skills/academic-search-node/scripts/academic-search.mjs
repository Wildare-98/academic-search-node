import { searchOpenAlex, getOpenAlexWork } from './lib/openalex.mjs';
import { searchCrossref } from './lib/crossref.mjs';
import { searchSemantic, getSemanticPaper, S2_API_KEY } from './lib/semantic-scholar.mjs';
import { searchArxiv } from './lib/arxiv.mjs';
import { searchPubmed, getPubmedArticle } from './lib/pubmed.mjs';
import { formatPaper, parseArgs, sleep } from './lib/utils.mjs';
import { SOURCE_LABELS, parseMultiSources, interleaveAndMerge, mergePaper, normalizeDoi, finalizePaper } from './lib/multi.mjs';
import { fetchFullText } from './lib/fulltext.mjs';

const args = parseArgs(process.argv);
const source = args._[0] || 'multi';
const query = args._[1] || '';
const maxResults = parseInt(args.n || args['max-results'] || 10);
const formatType = args.f || args.format || 'text';
const outputFile = args.o || args.output || null;
const delay = parseInt(args.delay || 0);

async function main() {
  const startTime = Date.now();
  let results = [];

  switch (source) {
    case 'openalex': {
      if (!query) return usage('openalex <query>');
      console.log(`[OpenAlex] Searching: "${query}"`);
      results = await searchOpenAlex(query, maxResults, args.year);
      break;
    }

    case 'semantic': {
      if (!query) return usage('semantic <query>');
      console.log(`[SemanticScholar] Searching: "${query}"`);
      if (S2_API_KEY) console.log('Using configured Semantic Scholar API Key');
      results = await searchSemantic(query, maxResults, args['min-citations']);
      break;
    }

    case 'crossref': {
      const doi = args.doi || query;
      if (!doi) return usage('crossref --doi <doi>');
      console.log(`[Crossref] Fetching DOI: ${doi}`);
      const paper = await searchCrossref(doi);
      results = [paper];
      break;
    }

    case 'arxiv': {
      if (!query) return usage('arxiv <query>');
      console.log(`[arXiv] Searching: "${query}"`);
      results = await searchArxiv(query, maxResults, args['sort-by'] || 'relevance', args.category);
      break;
    }

    case 'pubmed': {
      if (!query) return usage('pubmed <query>');
      console.log(`[PubMed] Searching: "${query}"`);
      results = await searchPubmed(query, maxResults, args.sort || 'relevance');
      break;
    }
    case 'fetch-fulltext': {
      const inputFile = args.input || null;
      const target = query || args.doi || args.pmcid || args.pmid || args.arxiv || null;
      if (!inputFile && !target) return usage('fetch-fulltext <identifier-or-url> or --input <results.json>');
      const maxMb = Number(args['max-mb'] || 50);
      const report = await fetchFullText({
        target,
        inputFile,
        outputDir: args['output-dir'] || 'fulltext',
        maxFiles: args['max-files'],
        maxBytes: maxMb * 1024 * 1024,
        delay,
        overwrite: Boolean(args.overwrite),
        manifestName: args.manifest || 'fetch-manifest.json'
      });
      console.log(`\n[FullText] downloaded=${report.summary.downloaded}, existing=${report.summary.existing}, unavailable=${report.summary.unavailable}`);
      for (const item of report.items) {
        const label = item.title || item.doi || item.pmcid || item.pmid || item.arxivId || `item-${item.index}`;
        console.log(`[${item.status}] ${label}${item.filePath ? ` -> ${item.filePath}` : ''}`);
      }
      console.log(`Manifest: ${report.manifestPath}`);
      return;
    }


    case 'multi': {
      if (!query) return usage('multi <query>');
      console.log(`[Multi] Searching: "${query}"`);
      const selectedSources = parseMultiSources(args.sources);
      if (S2_API_KEY && selectedSources.includes('semantic')) {
        console.log('Using configured Semantic Scholar API Key');
      }
      const perSourceLimit = Math.max(1, parseInt(args['per-source'] || maxResults));
      const searchers = {
        openalex: () => searchOpenAlex(query, perSourceLimit, args.year),
        semantic: () => searchSemantic(query, perSourceLimit, args['min-citations']),
        pubmed: () => searchPubmed(query, perSourceLimit, args.sort || 'relevance'),
        arxiv: () => searchArxiv(query, perSourceLimit, args['sort-by'] || 'relevance', args.category)
      };

      const settled = await Promise.allSettled(
        selectedSources.map(sourceId => searchers[sourceId]())
      );
      const sourceResults = {};

      for (let i = 0; i < selectedSources.length; i++) {
        const sourceId = selectedSources[i];
        const result = settled[i];
        if (result.status === 'fulfilled') {
          sourceResults[sourceId] = result.value;
          console.log(`[Multi] ${SOURCE_LABELS[sourceId]}: ${result.value.length} results`);
        } else {
          sourceResults[sourceId] = [];
          console.error(`[Multi] ${SOURCE_LABELS[sourceId]} failed: ${result.reason?.message || result.reason}`);
        }
      }

      // Interleave by rank so one provider cannot occupy the whole result set.
      // Duplicate records are merged and retain all source provenance.
      results = interleaveAndMerge(sourceResults, selectedSources).slice(0, maxResults);

      // Crossref enriches DOI metadata; it is not a keyword-search source.
      for (let i = 0; i < results.length; i++) {
        const doi = normalizeDoi(results[i].doi);
        if (doi) results[i].doi = doi;
        if (doi && (!results[i].abstract || !results[i].venue || !results[i].year)) {
          try {
            const cr = await searchCrossref(doi);
            results[i] = mergePaper(results[i], cr, 'Crossref');
          } catch {
            // ignore crossref enrichment errors
          }
        }
        if (delay > 0 && i < results.length - 1) await sleep(delay);
      }
      results = results.map(finalizePaper);
      break;
    }

    case 'batch': {
      const queries = args._.slice(1);
      if (queries.length === 0) return usage('batch <query1> [query2] ...');
      for (let i = 0; i < queries.length; i++) {
        console.log(`\n[Batch ${i + 1}/${queries.length}] ${queries[i]}`);
        const papers = await searchOpenAlex(queries[i], maxResults);
        for (const p of papers) {
          console.log('\n' + formatPaper(p, 'OpenAlex'));
          console.log('-'.repeat(60));
        }
        if (delay > 0 && i < queries.length - 1) await sleep(delay);
      }
      return;
    }

    default:
      return usage();
  }

  const elapsed = Date.now() - startTime;

  if (formatType === 'json') {
    const json = JSON.stringify(results, null, 2);
    if (outputFile) {
      const fs = await import('fs');
      fs.writeFileSync(outputFile, json, 'utf-8');
      console.log(`\nSaved ${results.length} results to ${outputFile} (${elapsed}ms)`);
    } else {
      console.log(json);
    }
  } else {
    for (let i = 0; i < results.length; i++) {
      console.log(`\n[${i + 1}]`);
      console.log(formatPaper(results[i], results[i].source));
      console.log('='.repeat(60));
    }
    console.log(`\nTotal: ${results.length} results (${elapsed}ms)`);
    if (outputFile) {
      const fs = await import('fs');
      const text = results.map((p, i) => `[${i + 1}]\n${formatPaper(p, p.source)}\n`).join('\n');
      fs.writeFileSync(outputFile, text, 'utf-8');
      console.log(`Saved to ${outputFile}`);
    }
  }
}

function usage(cmd) {
  console.log(`Usage: node academic-search.mjs <source> [options]

Sources:
  openalex <query>        Search OpenAlex
  semantic <query>        Search Semantic Scholar
  crossref --doi <doi>    Query Crossref by DOI
  arxiv <query>           Search arXiv preprints
  pubmed <query>          Search PubMed biomedical literature
  fetch-fulltext <id|url> Download verified open full text or process a result JSON
  multi <query>           Multi-source search (default): OpenAlex + Semantic + arXiv + PubMed
  batch <q1> [q2] ...     Batch search multiple queries

Options:
  -n, --max-results <num>  Max results (default: 10)
  -f, --format <type>      Output format: text | json (default: text)
  -o, --output <file>      Save output to file
  --year <year>            Filter by year (OpenAlex)
  --min-citations <num>    Min citations (Semantic Scholar)
  --category <cat>         arXiv category e.g. cs.LG, q-bio.GN
  --sort-by <type>         arXiv sort: relevance | lastUpdatedDate | submittedDate
  --sources <list>         Multi sources, comma-separated (default: all four)
  --per-source <num>       Results fetched from each source (default: max-results)
  --input <file>           Batch input from multi JSON output
  --output-dir <dir>       Full-text output directory (default: fulltext)
  --max-files <num>        Max papers processed from input JSON
  --max-mb <num>           Per-file size limit in MB (default: 50)
  --overwrite              Replace existing downloaded files
  --manifest <name>        Manifest filename (default: fetch-manifest.json)
  --delay <ms>             Delay between requests (default: 0)

Examples:
  node academic-search.mjs openalex "machine learning" -n 5
  node academic-search.mjs semantic "transformer" --min-citations 100
  node academic-search.mjs crossref --doi "10.1016/j.carbpol.2026.125373"
  node academic-search.mjs arxiv "transformer" --category cs.LG
  node academic-search.mjs pubmed "CRISPR gene editing" -n 10
  node academic-search.mjs multi "attention mechanism" -f json -o result.json
  node academic-search.mjs fetch-fulltext "arXiv:1706.03762" --output-dir fulltext
  node academic-search.mjs fetch-fulltext --input result.json --output-dir fulltext
`);
  if (cmd) console.log(`Missing argument for: ${cmd}`);
  process.exit(1);
}

main().catch(err => {
  console.error('[Error]', err.message);
  if (err.statusCode) console.error('HTTP Status:', err.statusCode);
  process.exit(1);
});
