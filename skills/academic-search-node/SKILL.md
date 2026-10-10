---
name: academic-search-node
description: 小喜六连阳——基于Node.js的学术论文多源检索工具，支持OpenAlex、Crossref、Semantic Scholar、arXiv、PubMed五库检索，无需Python环境。当用户搜索学术论文、查找文献、生成参考文献列表时触发。
license: MIT
---

# 学术检索助手(Node版)

**创建者：小喜六连阳**

基于 Node.js 的学术论文多源检索工具，使用 OpenAlex、Semantic Scholar、arXiv、PubMed 检索，并用 Crossref 补全 DOI 元数据。

**特点：**
- 无需 Python 环境，仅需 Node.js
- 支持 Windows 注册表读取用户级环境变量
- 自动 429 退避重试
- 支持批量查询节流
- 支持开放全文单篇/批量下载、类型校验和下载清单

---

## 数据源

| 数据源 | 是否需要 Key | 特点 |
|--------|------------|------|
| OpenAlex | ❌ 免费 | 覆盖全学科，2亿+记录 |
| Crossref | ❌ 免费 | DOI元数据补全，卷期页码 |
| Semantic Scholar | ⚠️ 可选 | 有Key解除速率限制 |
| arXiv | ❌ 免费 | 预印本，PDF可直接下载 |
| PubMed | ❌ 免费 | 生物医学/生命科学文献 |

---

## 环境变量配置

```powershell
# 临时设置
$env:SEMANTIC_SCHOLAR_API_KEY="s2k-xxxxx"

# 永久设置（用户级）
[Environment]::SetEnvironmentVariable("SEMANTIC_SCHOLAR_API_KEY", "s2k-xxxxx", "User")
```

---

## 命令行使用

```bash
node scripts/academic-search.mjs <source> "<关键词>" [选项]
```

### 数据源

| source | 说明 |
|--------|------|
| `openalex` | OpenAlex 搜索 |
| `crossref` | 通过 DOI 查 Crossref |
| `semantic` | Semantic Scholar 搜索 |
| `arxiv` | arXiv 预印本搜索 |
| `pubmed` | PubMed 生物医学文献搜索 |
| `multi` | 四个检索源并行检索，Crossref 补全元数据（推荐） |
| `fetch-fulltext` | 下载并校验开放全文，支持单篇标识符和多库 JSON |

### 选项

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-n, --max-results` | 最大结果数 | 10 |
| `-f, --format` | 输出格式（text/json） | text |
| `-o, --output` | 保存到文件 | - |
| `--doi` | DOI（用于 crossref） | - |
| `--year` | 年份过滤 | - |
| `--min-citations` | 最低引用数（semantic） | - |
| `--delay` | 请求间隔(ms) | 0 |
| `--sources` | multi 使用的数据源，逗号分隔 | openalex,semantic,pubmed,arxiv |
| `--per-source` | 每个数据源获取的候选数 | 与 max-results 相同 |
| `--input` | fetch-fulltext 批量输入的 JSON 文件 | - |
| `--output-dir` | 原文保存目录 | fulltext |
| `--max-files` | 最多处理的文献数 | 全部 |
| `--max-mb` | 单个文件大小上限（MB） | 50 |
| `--overwrite` | 覆盖已存在文件 | 关闭 |
| `--manifest` | 下载清单文件名 | fetch-manifest.json |

### 示例

```bash
# OpenAlex 搜索
node scripts/academic-search.mjs openalex "machine learning" -n 10

# Semantic Scholar 搜索
node scripts/academic-search.mjs semantic "transformer" -n 5 --min-citations 100

# Crossref DOI 查询
node scripts/academic-search.mjs crossref --doi "10.1016/j.carbpol.2026.125373"

# arXiv 预印本搜索
node scripts/academic-search.mjs arxiv "transformer" --category cs.LG

# PubMed 生物医学搜索
node scripts/academic-search.mjs pubmed "CRISPR gene editing" -n 10

# 多库均衡检索（推荐）
node scripts/academic-search.mjs multi "attention mechanism" -n 10 -f json

# 医学综述可优先使用这三个来源
node scripts/academic-search.mjs multi "CRISPR gene editing" --sources openalex,semantic,pubmed -n 20 -f json


# 多库检索后批量下载开放全文
node scripts/academic-search.mjs multi "CRISPR gene editing" --sources openalex,semantic,pubmed -n 20 -f json -o result.json
node scripts/academic-search.mjs fetch-fulltext --input result.json --output-dir fulltext

# 单篇 DOI、PMCID 或 arXiv ID
node scripts/academic-search.mjs fetch-fulltext "10.1186/s41239-019-0171-0" --output-dir fulltext
# 批量查询
node scripts/academic-search.mjs batch "query1" "query2" "query3"
```

---

## 多库合并规则

- OpenAlex、Semantic Scholar、PubMed、arXiv 并行检索。
- 按各数据库内部相关性顺序轮询纳入，避免单一数据库占满结果。
- 按规范化 DOI、PMID、arXiv ID 或标题合并同一论文，并保留 `sources` 来源列表。
- Crossref 不参与关键词检索，只在 DOI 存在且元数据不完整时补充摘要、期刊、年份等信息。

## 原文获取与下载

`fetch-fulltext` 只获取已验证的开放全文，不绕过付费墙或登录验证。支持：

- 单篇：DOI、PMID、PMCID、arXiv ID、HTTP(S) 开放全文网址。
- 批量：读取 `multi -f json -o result.json` 生成的结果文件。
- 格式：PDF、JATS XML、经验证的全文 HTML 或纯文本。
- PMC：优先尝试 Europe PMC PDF；无法取得 PDF 时保存完整 JATS XML。
- DOI：通过 OpenAlex 与 Semantic Scholar 查找合法开放版本。

每次运行都会在输出目录写入 `fetch-manifest.json`，记录：

- 下载成功、文件已存在或全文不可用。
- 原始链接、最终跳转链接、文件格式、字节数。
- 每个失败候选链接及失败原因。

常用流程：

```bash
node scripts/academic-search.mjs multi "CRISPR gene editing" --sources openalex,semantic,pubmed -n 20 -f json -o result.json
node scripts/academic-search.mjs fetch-fulltext --input result.json --output-dir fulltext
```

已下载的 PDF/XML 是原始证据文件，但本命令不负责完成研究质量评价或自动生成可信结论；正式综述仍需核对方法、数据、局限性和原文页码。

---

## 作为模块导入

```javascript
import { searchOpenAlex, searchCrossref, searchSemantic, searchArxiv, searchPubmed, fetchFullText } from './scripts/lib/index.mjs';
```
