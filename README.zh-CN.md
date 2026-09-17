# cs2-c4-damage

[English canonical README](README.md)

独立、可复用的 TypeScript library，用于解析 current-CS2 烘焙 C4 伤害场，提供可审计的
field-only 计算，并为匹配 build 的 native qualification 准备工具。**external model 已实现且
已达到 qualification-ready，但尚未通过动态 native parity qualification。**

> 本项目不向 CS2 注入代码。
>
> 本项目不 hook client.dll/server.dll。
>
> 本项目不分发 Valve 游戏资产。

**仅靠 GSI 的估算目前不能声称完整 native parity，因为 GSI 不暴露原生查询使用的全部输入。**

## 当前范围

已实现：

- Source 2 Viewer 反编译 `CS2_BOMB_DAMAGE_DATA`（version 1/2）的严格 parser 和 validator；
- 32-unit bombsite 扩展、确定性的 field lookup、原始 Phase/power 转换、`/256` 方向解码，
  以及文档中的 Bias/截断数学；
- 要求显式 sample point 的 field-only helper，并保留 native collision 与二次采样的不确定性；
- 已解码的 GSI-like adapter、Node 提取/检查/预测 CLI，以及绑定 build/resource identity 的
  machine-readable qualification harness。

对合法输入，`predictC4Outcome` 仍明确返回 `unavailable: model-not-qualified`。静态分析已证明
native query 还需要 target 提供的 sample point、collision/ground truth 和条件性二次采样，普通
field 加 GSI 无法重建这些输入。详见[native query closure](docs/research/native-query-closure.md)。

`exact` 只为完整模型通过 qualification 后保留；`bounded` 仅能来自调用方提供、已经证明覆盖
所有未知量的 inclusive envelope，field-only 估计不会被静默升级为该 envelope。unknown 绝不等于
零伤害、站立或一次成功的 native query。

这是 library，不是 HUD；runtime dependency 为零，不依赖 RivalHub、React、OBS、Fastify、
CSTV 或特定 GSI library。RivalHub-Broadcast 未来只是 downstream consumer 之一。

## 架构

```text
用户自己持有的 CS2 地图资源 + compiled resource
  → Node 提取 / 带 provenance 的 normalized field
  → 纯 field parser、lookup 与 arithmetic
  → decoded telemetry adapter / qualification harness
  → 通过匹配 build 的 native qualification 后才允许 exact
```

Field contract 保留包区边界和 power、位置、原始 Phase/Yaw/Pitch，以及提取来源。
归一化格式版本、模型修订、CS2 build/resource identity 与 npm SemVer 严格分离。
详见[架构](docs/architecture.md)、[模型状态](docs/model.md)和[研究来源](docs/research/PROVENANCE.md)。

## API

```ts
import { outcomeFromDamageRange, predictC4Outcome } from 'cs2-c4-damage';
import { assessGsiSnapshot } from 'cs2-c4-damage/gsi';
import { parseBombDamageVdata } from 'cs2-c4-damage';

// 仅为 synthetic 算术示例；不是从 GSI 推导出的上下界。
outcomeFromDamageRange(50, { min: 40, max: 60 }, ['ducked']);
// bounded；hpAfter: { min: 0, max: 10 }；lethal: 'indeterminate'

assessGsiSnapshot({ health: 50 });
// 缺失空间输入，以及未知 ducked、collision 和 native second sample。

// 即使 field 和外部输入完整，在缺失语义完成匹配 native qualification 前仍 fail closed。
predictC4Outcome({
  field,
  bombPosition,
  playerPosition,
  playerForward,
  ducked,
  health,
});

// parser 要求显式 provenance；未知 hash 用 null 表示。
parseBombDamageVdata(vdataText, {
  mapName: 'de_mirage',
  sourceBuildId: '25218825',
  resourceSha256: compiledResourceSha256,
  decompiledVdataSha256,
  extraction: { tool: 'Source 2 Viewer', revision: '20.0.6980' },
});
```

Parser 会记录 `sourcePairStatus: "unverified-source-pair"`：同时对用户提供的
compiled resource 与 decompiled text 做 hash，并不能证明二者存在来源关系。Node
extractor 还会记录 decompiled hash 与 canonical `normalizedFieldSha256`；qualification
会绑定这些 identity，但保留 source-pair 未验证这一限制。

`C4Outcome` 区分 `exact`、`bounded` 与 `unavailable`。对于已经证明完整覆盖的伤害区间，
最小伤害达到 HP 则确定致死，最大伤害小于 HP 则确定存活，否则为 `indeterminate`。
即使两端相同，也仍保留 `bounded`；该 helper 不负责证明区间来源可靠。

GSI 入口只接收**已解码的 GSI-like 快照**，不是原始 Valve JSON parser。
它验证 bomb/player position、forward 和正 health，不编造 crouch，也不评估 freshness、
observer coverage 或 RivalHub runtime continuity。

## Node tooling

package 暴露 `cs2-c4-damage/node` 和同 package 的 `cs2-c4-damage` binary。
提取器读取用户自己持有的文件，不 vendoring 或发布 Valve resource。

```sh
cs2-c4-damage extract \
  --vdata <decompiled.vdata> \
  --compiled <baked_bomb_damage.vdata_c> \
  --map de_mirage \
  --build-id 25218825 \
  --client-sha256 <client.dll-sha256> \
  --out field.json

cs2-c4-damage inspect field.json
cs2-c4-damage predict field.json --bomb-position x,y,z \
  --player-position x,y,z --forward x,y,z --health 100 \
  --ducked unknown
cs2-c4-damage qualify vectors.json field.json
```

`predict` 输出 fail-closed 的顶层结果。可选的 `--sample-position` 只输出明确标记的
field-only 计算；它不是 native-parity prediction，也不是 conservative native damage envelope。

Qualification vectors 必须包含 `schemaVersion: 1`、明确的 `modelRevision`、compiled 与
decompiled resource hash、`normalizedFieldSha256`，以及
`sourcePairStatus: "unverified-source-pair"`，并可保留 `nativeFailureReason` 与仅用于
evidence 的 native trace。当前 harness 只比较最终 native validity 和 damage。通过要求至少
一个 native-valid case、所有正例 exact damage 匹配且没有未解决的正例；负例单独统计。它
本身不能闭合 Q1–Q3，这仍需要 Windows trace instrumentation 或等价的 native debug capture。

## 开发

需要 Node >=22 与 `package.json` 固定版本的 pnpm：

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:package
```

单 package，strict TypeScript、tsup，根路径、`/gsi` 和 `/node` 均支持 ESM + CommonJS。
CI 覆盖 Linux、Windows、macOS 上的 Node 22/24。确定性测试使用手工 synthetic fixtures；
真实资产 qualification 放入 gitignored `qualification/` 或 `.agent-tmp/`，不进入 package。
详见[贡献指南](CONTRIBUTING.md)。

当前版本为 `0.0.0`，使用 `private: true` 防止误发布；没有 npm release 或 GitHub release。

## Research credits / 研究贡献

current-CS2 native C4 damage query path、client HUD call chain、server actual-damage
path、ABI、stance/facing correction 和 armor semantics 等关键 native findings 来自
[unicbm](https://github.com/unicbm) 的 reverse-engineering research。
本项目经作者授权使用该研究建立；external implementation、API、GSI uncertainty model
和 tests 属于本项目后续实现。原始研究本身不证明外部引擎已达到 parity。

[Source 2 Viewer](https://s2v.app) /
[ValveResourceFormat](https://github.com/ValveResourceFormat/ValveResourceFormat)
是公开资源格式 prior art 和计划中的提取路径。本 package 未复制其实现代码或 Valve 资产。
Valve 的[2026 年 7 月更新记录](https://store.steampowered.com/news/posts/?appids=730&enddate=1784076119)
说明了预计算伤害和传播冲击波。
固定版本引用见[研究来源](docs/research/PROVENANCE.md)。

## 许可与署名

项目新代码采用 [Apache-2.0](LICENSE)，允许开源、闭源、商业 tooling 按许可条件复用，
包含明确署名与专利授权条款。RivalHub-Broadcast 等 AGPL 应用可以作为依赖使用，
下游仍须遵守自身许可义务。

**原始研究 Markdown 是例外：版权归 unicbm，经许可转载并用于实现，并未重新许可为 Apache-2.0。**
本项目不据此推定原作者向所有下游授予单独的文本再许可。
详见[授权记录](docs/research/authorization.md)、[NOTICE](NOTICE) 和 [CREDITS](CREDITS.md)。
原始研究不在 npm package 发布白名单中。

本项目不代表 Valve、Counter-Strike 或 Steam，也未获其背书。
