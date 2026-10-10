# Academic Search Node · 学术检索助手

[English](README.md) | [简体中文](README.zh-CN.md)

一个基于 Node.js 的 Agent Skill，支持 OpenAlex、Semantic Scholar、arXiv 和 PubMed 文献检索，使用 Crossref 补全 DOI 元数据，并下载可获取的开放全文。

**原始创建者：小喜六连阳。** 本仓库保留所提供的 skill 和脚本，补充用于公开分发的仓库文档与目录结构。

## 功能

- 通过统一命令行检索四个文献数据库。
- 按规范化 DOI、PMID、arXiv ID 或标题合并记录，保留来源信息。
- 按各数据库内部排名交替纳入结果，减少单一来源占满列表的情况。
- 使用 Crossref 补全文献的 DOI 元数据。
- 输出文本或 JSON，支持 OpenAlex 批量关键词查询。
- 下载可获取的 PDF、JATS XML、全文 HTML 或文本，提供格式检查、文件大小限制和下载清单。
- 从环境变量读取可选的 Semantic Scholar 密钥；Windows 下也支持读取注册表中的用户级环境变量。
- 仅使用 Node.js 内置模块，无需 Python，也无需安装 npm 依赖。

## 环境要求

- 建议使用 Node.js 20 或更新版本。
- 能够访问所选文献数据库的网络环境。
- 各数据库的可用性、认证要求和限流规则由服务方决定。当前脚本仅支持配置 Semantic Scholar 的可选密钥。

## 快速开始

```bash
git clone https://github.com/Wildare-98/academic-search-node.git
cd academic-search-node/skills/academic-search-node

# 多库检索，并将纯 JSON 结果保存到文件
node scripts/academic-search.mjs multi "attention mechanism" -n 10 -f json -o result.json

# 根据检索结果下载可获取的开放全文
node scripts/academic-search.mjs fetch-fulltext --input result.json --output-dir fulltext
```

命令行会向标准输出打印进度信息。如果 JSON 需要交给其他程序读取，请使用 `-o result.json`；直接重定向全部控制台输出会把进度信息一起写入文件。

## 安装为 Agent Skill

将整个 `skills/academic-search-node` 目录复制到所用 Agent 支持的 skill 目录。采用 `.agents/skills` 约定的工具，其用户级目标路径为 `~/.agents/skills/academic-search-node`。

例如，克隆仓库后，在仓库根目录运行 PowerShell：

```powershell
$skillDir = Join-Path $HOME '.agents\skills'
New-Item -ItemType Directory -Force -Path $skillDir | Out-Null
Copy-Item -LiteralPath '.\skills\academic-search-node' -Destination $skillDir -Recurse
```

若目标位置已安装同名 skill，请先检查差异再替换。部分 Agent 需要重启或重新加载才会发现新 skill。直接运行命令行无需先安装到 Agent。

## 可选的 Semantic Scholar 密钥

脚本从 `SEMANTIC_SCHOLAR_API_KEY` 读取密钥。下列值均为占位符。

```powershell
# 当前 PowerShell 会话
$env:SEMANTIC_SCHOLAR_API_KEY = 'YOUR_API_KEY'

# 可选：持久保存到 Windows 用户级环境变量
[Environment]::SetEnvironmentVariable('SEMANTIC_SCHOLAR_API_KEY', 'YOUR_API_KEY', 'User')
```

```bash
# macOS / Linux：当前 shell 会话
export SEMANTIC_SCHOLAR_API_KEY='YOUR_API_KEY'
```

当前脚本不会自动加载 `.env` 文件。请勿将真实密钥写入源文件、提交记录、日志或 Issue。

## 命令示例

以下命令均在 `skills/academic-search-node` 目录执行：

```bash
# 单库检索
node scripts/academic-search.mjs openalex "machine learning" -n 5 --year 2024
node scripts/academic-search.mjs semantic "transformer" -n 5 --min-citations 100
node scripts/academic-search.mjs arxiv "transformer" --category cs.LG
node scripts/academic-search.mjs pubmed "CRISPR gene editing" -n 10
node scripts/academic-search.mjs crossref --doi "10.1186/s41239-019-0171-0"

# 指定多库检索来源和每库候选数量
node scripts/academic-search.mjs multi "CRISPR gene editing" --sources openalex,semantic,pubmed --per-source 20 -n 10 -f json -o result.json

# 下载单篇，或限制批量下载数量、大小和间隔
node scripts/academic-search.mjs fetch-fulltext "arXiv:1706.03762" --output-dir fulltext
node scripts/academic-search.mjs fetch-fulltext --input result.json --max-files 5 --max-mb 50 --delay 1000

# 批量关键词查询使用 OpenAlex
node scripts/academic-search.mjs batch "query one" "query two" -n 5 --delay 1000
```

完整 skill 说明与选项见 [SKILL.md](skills/academic-search-node/SKILL.md)。Crossref 用于 DOI 查询和元数据补全，不参与关键词检索。部分参数仅作用于对应数据库，例如 `--year` 过滤 OpenAlex 的结果。

## 全文输出

文件保存到 `--output-dir` 指定的目录，默认是 `fulltext`。默认下载清单 `fetch-manifest.json` 记录每篇文献的状态、来源链接、最终链接、保存路径、格式、字节数，以及失败的下载尝试。已有文件默认保留，提供 `--overwrite` 才会覆盖。

全文检查用于识别文件类型并拒绝明显的访问验证页面，不代表研究质量评价，也不能保证文章完整性。全文可用性取决于出版方和数据库。工具不会绕过付费墙或登录要求；使用下载内容前，应核对原文及其使用许可。

## 仓库结构

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

公开分发包不包含本地 SkillHub 安装元数据。按默认名称生成的检索结果和全文下载文件已加入 Git 忽略规则。

## 反馈与贡献

欢迎提交 Issue 或 Pull Request。请提供可复现命令、Node.js 版本、数据源和相关报错，并在分享日志前移除凭据及私密查询信息。修改脚本后可使用 `node --check path/to/file.mjs` 检查语法；如果进行过实时 API 验证，请说明范围和结果。

## 许可证

采用 [MIT 许可证](LICENSE)，与原始 skill 声明一致，并保留原始创建者署名。软件许可证不涵盖第三方文献或数据库内容。
