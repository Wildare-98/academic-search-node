# Academic Search Node

[English](README.md) | [简体中文](README.zh-CN.md)

A Node.js agent skill for searching academic literature across OpenAlex, Semantic Scholar, arXiv, and PubMed, enriching DOI metadata with Crossref, and downloading available open-access full text.

**Original creator: 小喜六连阳.** This repository preserves the supplied skill and scripts; the repository documentation and packaging are provided for public distribution.

## Features

- Search four literature databases from one command line interface.
- Merge results by normalized DOI, PMID, arXiv ID, or title, retaining source provenance.
- Interleave results by provider rank so one database does not fill the result list.
- Enrich incomplete DOI metadata with Crossref.
- Export text or JSON results and run batches of OpenAlex queries.
- Download available PDF, JATS XML, full-text HTML, or text, with format checks, file size limits, and a download manifest.
- Read an optional Semantic Scholar API key from the environment, or user-level Windows environment variables through the registry.
- Use Node.js built-in modules; no Python or npm dependency installation is required.

## Requirements

- Node.js 20 or later is recommended.
- Internet access to the selected literature databases.
- API availability, authentication requirements, and rate limits depend on each provider. The current scripts configure an optional key for Semantic Scholar only.

## Quick start

```bash
git clone https://github.com/Wildare-98/academic-search-node.git
cd academic-search-node/skills/academic-search-node

# Search multiple databases and save clean JSON to a file
node scripts/academic-search.mjs multi "attention mechanism" -n 10 -f json -o result.json

# Download available open-access full text from those results
node scripts/academic-search.mjs fetch-fulltext --input result.json --output-dir fulltext
```

The CLI writes progress messages to standard output. Use `-o result.json` for JSON that will be consumed by another program; redirecting all console output to a JSON file also captures progress messages.

## Install as an agent skill

Copy the entire `skills/academic-search-node` directory to your agent's supported skill directory. For hosts using the `.agents/skills` convention, the user-level destination is `~/.agents/skills/academic-search-node`.

For example, in PowerShell after cloning the repository:

```powershell
$skillDir = Join-Path $HOME '.agents\skills'
New-Item -ItemType Directory -Force -Path $skillDir | Out-Null
Copy-Item -LiteralPath '.\skills\academic-search-node' -Destination $skillDir -Recurse
```

If that skill is already installed, review differences before replacing it. Restart or reload your agent if its skill discovery requires it. Direct CLI use works independently of agent installation.

## Optional Semantic Scholar key

The key is read from `SEMANTIC_SCHOLAR_API_KEY`. The examples below are placeholders.

```powershell
# Current PowerShell session
$env:SEMANTIC_SCHOLAR_API_KEY = 'YOUR_API_KEY'

# Optional: persist in the Windows user environment
[Environment]::SetEnvironmentVariable('SEMANTIC_SCHOLAR_API_KEY', 'YOUR_API_KEY', 'User')
```

```bash
# macOS / Linux: current shell session
export SEMANTIC_SCHOLAR_API_KEY='YOUR_API_KEY'
```

An `.env` file is not automatically loaded by these scripts. Keep real keys out of source files, commits, logs, and issue reports.

## Command examples

Run these commands from `skills/academic-search-node`:

```bash
# Individual sources
node scripts/academic-search.mjs openalex "machine learning" -n 5 --year 2024
node scripts/academic-search.mjs semantic "transformer" -n 5 --min-citations 100
node scripts/academic-search.mjs arxiv "transformer" --category cs.LG
node scripts/academic-search.mjs pubmed "CRISPR gene editing" -n 10
node scripts/academic-search.mjs crossref --doi "10.1186/s41239-019-0171-0"

# Choose sources and candidate count for a merged search
node scripts/academic-search.mjs multi "CRISPR gene editing" --sources openalex,semantic,pubmed --per-source 20 -n 10 -f json -o result.json

# Download one paper, or a bounded batch
node scripts/academic-search.mjs fetch-fulltext "arXiv:1706.03762" --output-dir fulltext
node scripts/academic-search.mjs fetch-fulltext --input result.json --max-files 5 --max-mb 50 --delay 1000

# Batch queries use OpenAlex
node scripts/academic-search.mjs batch "query one" "query two" -n 5 --delay 1000
```

See [SKILL.md](skills/academic-search-node/SKILL.md) for the skill instructions and option reference. Crossref is used for DOI lookups and enrichment, rather than keyword search. Some flags apply only to their respective provider; for example, `--year` filters OpenAlex results.

## Full-text output

Downloads are written to the directory selected by `--output-dir` (default: `fulltext`). The default `fetch-manifest.json` records each paper's status, source URL, final URL, saved path, format, byte count, and failed download attempts. Existing files are preserved unless `--overwrite` is supplied.

Full-text checks identify file types and reject obvious access-challenge pages; they do not establish research quality or guarantee article completeness. Availability varies by publisher and provider. The tool does not bypass paywalls or login requirements. Review the original article and its reuse terms before using downloaded content.

## Repository layout

```text
academic-search-node/
├── README.md
├── README.zh-CN.md
├── LICENSE
├── .gitignore
└── skills/
    └── academic-search-node/
        ├── SKILL.md
        └── scripts/
            ├── academic-search.mjs
            └── lib/
```

Local SkillHub installation metadata is not included in this distribution. Generated search results and downloaded articles are ignored by Git using the default output names.

## Contributing

Open an issue or pull request with a reproducible example, Node.js version, provider, and relevant error message. Remove credentials and private query data before sharing logs. Check changed JavaScript modules with `node --check path/to/file.mjs` and describe any live API checks you performed.

## License

[MIT](LICENSE), matching the license declared in the supplied skill. Attribution to the original creator is retained. The software license does not cover third-party papers or database content.
