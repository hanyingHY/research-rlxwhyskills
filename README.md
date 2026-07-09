# research-rlxwhyskills
my open-sourse skills for your research actions(The second version)
# Research Skills Family Delivery / 研究技能家族交付文档

## 1. Product Overview / 产品概述

### Chinese

本次交付的是一套面向研究型项目的通用 skills family，目标是赋予任意 skill-capable agent 更强的研究组织、证据治理、方向发现、强化检索、冲突裁决、验证映射与多阶段推进能力。

这套产品已经支持：

1. `hub-first` 入口，先展示技能，再推荐，再等待用户显式选择
2. `lite` 轻量研究路径
3. `full` 全量研究程序路径
4. 非自动模式下阶段性“够用后询问是否继续优化”
5. 自动模式下显式 token 成本提醒
6. 自动模式下多窗口不可用时的单窗口串行回退
7. 单窗口串行回退的显式工件 `AUTONOMOUS_SERIAL_PLAN.md`
8. 家族级 quickstart、console、adapter pack、transfer packet、export bundle

### English

This delivery provides a reusable research-oriented skill family designed to give any skill-capable agent stronger capabilities for research organization, evidence governance, direction discovery, focused strengthening, conflict adjudication, validation mapping, and multi-stage execution.

The delivered family now supports:

1. `hub-first` entry, where the agent lists available entries, recommends one, and waits for explicit user choice
2. a lightweight `lite` research path
3. a full `full` research-program path
4. explicit “do you want one more bounded optimization wave?” checkpoints in non-autonomous mode
5. explicit token-cost warning in autonomous mode
6. single-window autonomous fallback when multi-window help is unavailable
7. an explicit `AUTONOMOUS_SERIAL_PLAN.md` artifact for that fallback
8. family-level quickstart, console, adapter pack, transfer packet, and export bundle surfaces

## 2. Delivered Artifacts / 交付产物

### Source Family / 源产品

- `C:\Users\Dell\Desktop\BDC\skills`

### Portable Backup Bundle / 可迁移备份产品

- `C:\Users\Dell\Desktop\BDC\rlxwrjhyskills`
- `C:\Users\Dell\Desktop\BDC\rlxwrjhyskills.zip`
- `C:\Users\Dell\Desktop\BDC\rlxwrjhyskills_manifest.json`

### Key Entry Files / 关键入口文件

- `C:\Users\Dell\Desktop\BDC\skills\research-skill-hub\SKILL.md`
- `C:\Users\Dell\Desktop\BDC\skills\research-pipeline-full\SKILL.md`
- `C:\Users\Dell\Desktop\BDC\skills\research-pipeline-lite\SKILL.md`
- `C:\Users\Dell\Desktop\BDC\skills\START_HERE_PROMPTS.md`

### Key Family Tools / 关键家族级工具

- `C:\Users\Dell\Desktop\BDC\skills\generate_research_skill_quickstart.py`
- `C:\Users\Dell\Desktop\BDC\skills\research_skill_console.py`
- `C:\Users\Dell\Desktop\BDC\skills\generate_research_platform_adapter_pack.py`
- `C:\Users\Dell\Desktop\BDC\skills\build_research_skill_prompt.py`
- `C:\Users\Dell\Desktop\BDC\skills\generate_research_skill_transfer_packet.py`
- `C:\Users\Dell\Desktop\BDC\skills\audit_research_skill_family_readiness.py`

## 3. Major Capabilities / 主要能力

### Chinese

#### 3.1 Hub-first routing

家族入口不会绕过选择过程。它会：

1. 发现本地可用 skills
2. 解释差异
3. 推荐最适合的 skill
4. 等待用户显式选择后再路由

#### 3.2 Full research program

`full` 路径提供：

1. 结构化 intake
2. retained evidence
3. 冲突裁决
4. direction selection
5. deep-dive budget planning
6. stable / aggressive route boards
7. validation planning
8. cloud and parallel execution references

#### 3.3 Autonomous mode

自动模式现在是正式支持的 `opt-in` 高强度模式，而不再只是概念性试行：

1. 必须显式提醒 token 消耗风险
2. 目标是推进到批准范围内最强可达结果
3. 结构一旦够用，就优先优化研究质量而不是继续美化结构
4. 遇到破坏性动作、重大范围跳变、或未批准的 route-board 决策时必须停下

#### 3.4 Single-window fallback

如果用户无法协助开多个窗口，自动模式不会被卡住。它会自动回退为单窗口串行角色流。

这套回退不只是 prompt 文本描述，还已经被做成显式工件：

1. `full`: `00_protocol/AUTONOMOUS_SERIAL_PLAN.md`
2. `lite`: `03_output/AUTONOMOUS_SERIAL_PLAN.md`

#### 3.5 Builder-level support

以下工具已经直接支持 autonomous prompt 构建，而不只是固定 quickstart 文案支持：

1. `build_research_skill_prompt.py --autonomous-mode`
2. `generate_research_skill_transfer_packet.py --autonomous-mode`
3. `generate_research_platform_adapter_pack.py` 中的 `autonomous_full`
4. `research_skill_console.py` 中的 `workspace_init_autonomous` 和 `prompt_pack_refresh_autonomous`

### English

#### 3.1 Hub-first routing

The family entry does not bypass choice. It:

1. discovers local skills
2. explains the differences
3. recommends the best fit
4. waits for explicit user choice before routing

#### 3.2 Full research program

The `full` path provides:

1. structured intake
2. retained evidence
3. conflict adjudication
4. direction selection
5. deep-dive budget planning
6. stable / aggressive route boards
7. validation planning
8. cloud and parallel execution references

#### 3.3 Autonomous mode

Autonomous mode is now a supported opt-in high-intensity mode rather than a merely conceptual pilot:

1. it explicitly warns about token-cost risk
2. it pushes toward the strongest reachable in-scope result
3. once structure is sufficient, it prioritizes research quality over further scaffold polishing
4. it still stops at destructive actions, major scope jumps, or unapproved board-choice decisions

#### 3.4 Single-window fallback

If the user cannot help open multiple windows, autonomous mode no longer blocks. It falls back to a serial single-window role flow.

This fallback is no longer only described in prompts. It is now an explicit artifact:

1. `full`: `00_protocol/AUTONOMOUS_SERIAL_PLAN.md`
2. `lite`: `03_output/AUTONOMOUS_SERIAL_PLAN.md`

#### 3.5 Builder-level support

The following tools now directly support autonomous prompt construction, not just fixed quickstart text:

1. `build_research_skill_prompt.py --autonomous-mode`
2. `generate_research_skill_transfer_packet.py --autonomous-mode`
3. `generate_research_platform_adapter_pack.py` via `autonomous_full`
4. `research_skill_console.py` via `workspace_init_autonomous` and `prompt_pack_refresh_autonomous`

## 4. Recommended Entry Points / 推荐启动入口

### Chinese

#### 默认入口

```text
Task: <TASK_STATEMENT>
Skill file: <FAMILY_ROOT>\research-skill-hub\SKILL.md
Instruction: Read that SKILL.md completely first, list the available local research skill entries, recommend the best fit, and wait for the user's explicit choice before routing.
```

#### 全自动全量入口

```text
Task: <TASK_STATEMENT>
Skill file: <FAMILY_ROOT>\research-pipeline-full\SKILL.md
Instruction: Read that SKILL.md completely first, then follow its referenced local resources and bundled scripts. Run in autonomous_mode, warn explicitly that token consumption may rise, keep major hard stops visible, and if multi-window help is unavailable, fall back to single-window phased execution instead of blocking.
```

### English

#### Default entry

```text
Task: <TASK_STATEMENT>
Skill file: <FAMILY_ROOT>\research-skill-hub\SKILL.md
Instruction: Read that SKILL.md completely first, list the available local research skill entries, recommend the best fit, and wait for the user's explicit choice before routing.
```

#### Autonomous full entry

```text
Task: <TASK_STATEMENT>
Skill file: <FAMILY_ROOT>\research-pipeline-full\SKILL.md
Instruction: Read that SKILL.md completely first, then follow its referenced local resources and bundled scripts. Run in autonomous_mode, warn explicitly that token consumption may rise, keep major hard stops visible, and if multi-window help is unavailable, fall back to single-window phased execution instead of blocking.
```

## 5. Validation and Audit Status / 验证与审计状态

### Chinese

当前验证结果：

1. source family validator：通过
2. source family smoke：通过
3. export family validator：通过
4. export family smoke：通过
5. proof source workspace：通过
6. proof export workspace：通过

最终家族级 readiness 审计结果见：

- `C:\Users\Dell\Desktop\BDC\audit\research_skill_family_readiness.md`

### English

Current validation status:

1. source family validator: passed
2. source family smoke: passed
3. export family validator: passed
4. export family smoke: passed
5. proof source workspace: passed
6. proof export workspace: passed

The final family-level readiness audit is recorded at:

- `C:\Users\Dell\Desktop\BDC\audit\research_skill_family_readiness.md`

## 6. Backup Product Review / 备份产品审查结果

### Chinese

我已经审查了备份产品：

1. `rlxwrjhyskills` 目录存在且完整
2. `rlxwrjhyskills.zip` 已更新
3. `rlxwrjhyskills_manifest.json` 指纹与组件信息正常
4. 导出包内部 `validate_research_skill_family.py` 运行通过
5. 导出包中已包含：
   - `AUTONOMOUS_SERIAL_PLAN.md` 相关生成与验证代码
   - `autonomous_full_prompt`
   - `workspace_init_autonomous`
   - `prompt_pack_refresh_autonomous`

结论：当前备份产品没有发现结构性问题。

### English

I reviewed the backup product and found it healthy:

1. the `rlxwrjhyskills` directory exists and is structurally complete
2. `rlxwrjhyskills.zip` has been refreshed
3. `rlxwrjhyskills_manifest.json` contains valid bundle and component fingerprints
4. the exported bundle's own `validate_research_skill_family.py` passes
5. the exported bundle includes:
   - `AUTONOMOUS_SERIAL_PLAN.md` generation and validation support
   - `autonomous_full_prompt`
   - `workspace_init_autonomous`
   - `prompt_pack_refresh_autonomous`

Conclusion: no structural issue was found in the current backup product.

## 7. Residual Frontier / 剩余前沿增强点

### Chinese

当前仍可继续增强的一点不是缺陷，而是 frontier：

将 `AUTONOMOUS_SERIAL_PLAN.md` 再推进成 machine-readable state machine，例如增加：

1. `serial_phase_current`
2. `serial_phase_next`
3. `serial_phase_completed`
4. `serial_phase_blockers`

这样自动模式的单窗口串行回退就能从“显式计划”进一步升级到“可恢复、可调度、可回放”。

### English

The remaining frontier is not a bug but a next-stage enhancement:

Promote `AUTONOMOUS_SERIAL_PLAN.md` into a machine-readable state machine, for example by adding:

1. `serial_phase_current`
2. `serial_phase_next`
3. `serial_phase_completed`
4. `serial_phase_blockers`

That would upgrade autonomous single-window fallback from an explicit plan into a recoverable, schedulable, replayable execution surface.
