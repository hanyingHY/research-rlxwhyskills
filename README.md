# Research Skills User Start Guide / Research Skills 用户启动指南

This guide is for the person using the skills, not for the package developer.

本说明是写给最终使用者的，不要求使用者了解代码或技能包内部结构。

## 1. What you have / 你拿到的两个文件

Upload or place these two files together with your project:

把下面两个文件与项目放在一起，或同时上传给支持文件读取的 AI：

1. `rlxwrjhyskills.zip` — the reusable research assistant package / 可复用的研究助手技能包
2. `RESEARCH_SKILLS_START_BILINGUAL.md` — this user guide / 本用户启动指南

You do not need to edit the ZIP. You only need to tell the AI what you want to research, improve, or rebuild.

你不需要修改 ZIP。你只需要告诉 AI：你要研究、改良或推倒重来什么。

## 2. Start in one message / 用一条消息启动

After uploading the ZIP and this guide, copy and send this message:

上传 ZIP 和本说明后，复制并发送下面这段话：

```text
Please read RESEARCH_SKILLS_START_BILINGUAL.md first, then inspect rlxwrjhyskills.zip. Explain the available Research Skill Hub, Research Pipeline Lite, and Research Pipeline Full options in plain language. Recommend the right option for my project, but wait for my explicit choice before starting a long research or implementation workflow.

请先阅读 RESEARCH_SKILLS_START_BILINGUAL.md，然后检查 rlxwrjhyskills.zip。请用通俗语言解释 Research Skill Hub、Research Pipeline Lite 和 Research Pipeline Full 的区别，根据我的项目给出推荐，但在开始长期研究或工程实施前等待我的明确选择。
```

The AI should respond with a short comparison and one clear choice point. If it starts changing code immediately, tell it: “先停下来，先完成技能选择和项目盘点，不要直接修改代码。”

AI 应先给出简短比较，并明确询问你选择哪条路线。如果它一开始就修改代码，请告诉它：“先停下来，先完成技能选择和项目盘点，不要直接修改代码。”

## 3. Which option should you choose? / 三种选择怎么选

### Hub — help me choose / Hub——帮我选择

Choose Hub when you are unsure which workflow fits. It compares the available skills and hands you a ready-to-use next prompt.

不知道选哪个时选 Hub。它会比较各技能，并生成下一步可直接使用的提示词。

### Lite — quick research triage / Lite——快速研究分诊

Choose Lite when you want a fast answer from a small or medium collection of papers, notes, datasets, or ideas. It produces a shortlist, evidence summary, action map, and a lightweight implementation snapshot.

材料规模较小或中等、希望快速得到候选方向和行动清单时选 Lite。它会生成候选清单、证据摘要、行动映射和轻量实现快照。

### Full — experiments, rebuilding, and release decisions / Full——实验、重建和发布决策

Choose Full when research must drive experiments, when code readiness matters, or when you are considering a major refactor or rebuild. Full keeps research evidence and code maturity separate, creates an engineering backlog, and blocks a route from execution or promotion until the required evidence exists.

研究要驱动实验、需要判断代码是否成熟，或你要进行大规模改良/推倒重来时选 Full。Full 会分别评估研究证据和代码成熟度，生成工程任务，并在证据不足时阻止执行或晋级。

For your project-improvement or rebuild request, Full is normally the right choice.

如果你的目标是项目改良或推倒重来，通常应选择 Full。

## 4. Prompt for improving or rebuilding a project / 项目改良或推倒重来的提示词

After choosing Full, send this prompt. Replace only the bracketed project description.

选择 Full 后发送下面的提示词。只需要把方括号中的项目描述替换成你的实际情况。

```text
I want to improve or rebuild this project: [describe the project and the result I want].

Start by auditing the current research, code, entrypoints, dependencies, tests, data flow, configuration, and delivery process. Tell me what should be kept, repaired, replaced, or retired, and why. Do not assume that existing code is runnable just because files exist.

Prepare an evidence-based plan before making major changes. I authorize you to implement approved improvements, but preserve a rollback path before irreversible deletion or overwrite. Do not silently discard research evidence or user decisions.

Keep research credibility and code implementation maturity as separate scores. Map every proposed route with an explicit route_id. Create the engineering backlog and readiness matrix. After implementation, run the available non-destructive checks and report what changed, what remains blocked, and what I must decide next.

我想改良或重建这个项目：[描述项目和希望达到的结果]。

请先审计当前研究、代码、入口、依赖、测试、数据流、配置和交付流程，说明哪些内容应保留、修复、替换或废弃，并解释原因。不要因为文件存在就假定代码可以运行。

请先建立基于证据的计划，再进行重大修改。我授权你实施已经批准的改良，但在不可逆删除或覆盖前保留回退路径。不要悄悄丢弃研究证据或用户决策。

请将研究可信度和代码实现成熟度分开评分，为每条路线设置显式 route_id，生成工程 backlog 和 readiness matrix。实施后运行可用的非破坏性检查，并报告改动内容、仍然阻塞的事项和下一步需要我决定的内容。
```

## 5. What happens after you start? / 启动后会发生什么

The workflow proceeds in visible stages:

流程会按以下阶段推进，并把结果展示给你：

1. **Project inventory / 项目盘点** — identifies code, entrypoints, dependencies, tests, data, and current documents.
2. **Research evidence review / 研究证据审查** — separates strong evidence from hypotheses, placeholders, and unsupported claims.
3. **Route definition / 路线定义** — turns promising directions into explicit routes with `route_id`.
4. **Implementation maturity review / 实现成熟度评估** — checks completeness, runnability, tests, reproduction, benchmarks, and delivery readiness.
5. **Improvement or rebuild plan / 改良或重建计划** — lists what will change, what will be retired, the expected artifacts, and acceptance conditions.
6. **Authorized implementation / 获授权实施** — changes code only within the scope you approved.
7. **Verification and decision / 验证与决策** — reruns checks and tells you whether the route is ready for execution, promotion, benchmark freeze, or release.

You may stop at any stage. The system should never silently move from research notes to experiments or from experiments to release.

你可以在任何阶段暂停。系统不应未经确认就从研究笔记进入实验，也不应从实验直接进入发布。

## 6. The decisions you will be asked to make / 你会遇到的决策点

Expect the AI to ask you about:

AI 通常会向你询问：

- whether to continue, repair, or rebuild an existing workspace / 继续、修复还是重建现有工作区；
- which research directions should advance or stay deferred / 哪些研究方向推进、哪些暂缓；
- whether to use local knowledge, project files, or external literature / 使用已有知识、项目文件还是外部文献；
- whether the next stage is single-window or multi-window / 下一阶段使用单窗口还是多窗口；
- whether an implementation repair is required before promotion / 晋级前是否需要先修复实现；
- whether a destructive code or data change is acceptable / 是否允许破坏性代码或数据修改。

These are safeguards, not errors. Answer them according to your project goals.

这些是保护机制，不是报错。请根据项目目标回答。

## 7. How to read the result / 如何看结果

For Full, the most important user-facing files are:

Full 最重要的用户可读产物是：

- `IMPLEMENTATION_READINESS.md` — plain-language implementation status / 通俗的实现成熟度状态；
- `route_readiness_matrix.csv` — independent research and code gates / 独立的研究与代码门控；
- `implementation_backlog.csv` — concrete engineering work / 可执行的工程任务；
- `code_inventory.csv` — discovered components and entrypoints / 发现的组件与入口。

The implementation levels mean:

实现等级含义如下：

| Level / 等级 | Meaning / 含义 |
| --- | --- |
| M0 | Concept or placeholder / 概念或占位 |
| M1 | Code mapped or scaffolded / 已映射代码或形成骨架 |
| M2 | Runnable enough for experiment execution / 足以执行实验 |
| M3 | Verified enough for result promotion / 足以晋级结果 |
| M4 | Reproducible with valid benchmark evidence / 有效基准证据支持复现 |
| M5 | Operational and release-ready / 运维成熟并可发布 |

Strong research evidence does not make M0 or M1 code execution-ready. / 研究证据很强，也不能把 M0 或 M1 代码描述成可执行。

## 8. Common user questions / 常见问题

**Do I need to edit the ZIP? / 需要修改 ZIP 吗？**

No. Upload it, let the AI inspect it, and only modify your project after the plan is visible and authorized.

不需要。上传 ZIP，让 AI 检查；等计划清晰并获得授权后，再修改你的项目。

**I only have research notes and no code. Is that a problem? / 只有研究笔记、没有代码怎么办？**

No. Research can be retained at `research_only`, but the system will not claim that experiments, benchmarks, or release are ready.

不是问题。研究可以保留为 `research_only`，但系统不会把实验、基准或发布描述为就绪。

**When should I choose quant-research? / 什么时候选 quant-research？**

Choose it for factors, signals, strategies, backtests, temporal datasets, portfolios, or benchmark-driven quantitative work.

涉及因子、信号、策略、回测、时序数据、组合或基准驱动的量化工作时选择它。

**Can I ask it to start over? / 可以要求推倒重来吗？**

Yes. Say what outcome must be preserved, authorize the rebuild scope, and require a rollback path before irreversible deletion.

可以。说明必须保留的目标，授权重建范围，并要求在不可逆删除前保留回退路径。
