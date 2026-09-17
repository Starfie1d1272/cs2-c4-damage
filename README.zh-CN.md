# cs2-c4-damage

[English canonical README](README.md)

独立、可复用的 TypeScript library 基础，用于将 current-CS2 烘焙 C4 伤害场与外部
telemetry 结合，估算伤害、爆炸后 HP 和致死结果。**目前仅为研究与架构基础，尚无通过资格验证的原生预测实现。**

> 本项目不向 CS2 注入代码。
>
> 本项目不 hook client.dll/server.dll。
>
> 本项目不分发 Valve 游戏资产。

**仅靠 GSI 的估算目前不能声称完整 native parity，因为 GSI 不暴露原生查询使用的全部输入。**

## 当前范围

已实现 domain contract、明确 fail closed 的预测入口、针对调用方提供的伤害区间进行
结果计算的纯函数、GSI-like 已知缺失输入标记、synthetic tests 和跨平台 package 工具链。
本阶段 `predictC4Outcome` 始终返回 `unavailable: model-not-qualified`。
尚无场 parser、提取 CLI、原生场查找或 gameplay 伤害公式。
`exact` 仅作为预留结果类型，当前函数不会返回它。

这是 library，不是 HUD；runtime dependency 为零，不依赖 RivalHub、React、OBS、Fastify、
CSTV 或特定 GSI library。RivalHub-Broadcast 未来只是 downstream consumer 之一。

## 架构

```text
用户自己持有的 CS2 地图资源
  → 提取 / 归一化（计划优先接入 VRF 反编译表示）
  → 纯 C4 引擎（当前为 contract，预测不可用）
  → telemetry adapter（当前 GSI-like 边界；未来 demo/replay 等）
```

Field contract 保留包区边界和 power、位置、原始 Phase/Yaw/Pitch，以及提取来源。
归一化格式版本、模型修订、CS2 build/resource revision 与 npm SemVer 严格分离。
无法确认数据与语义匹配时必须 fail closed。
详见[架构](docs/architecture.md)和[模型研究路线](docs/model.md)。

## API

```ts
import { outcomeFromDamageRange, predictC4Outcome } from 'cs2-c4-damage';
import { assessGsiSnapshot } from 'cs2-c4-damage/gsi';

// 仅为 synthetic 算术示例；不是从 GSI 推导出的上下界。
outcomeFromDamageRange(50, { min: 40, max: 60 }, ['ducked']);
// bounded；hpAfter: { min: 0, max: 10 }；lethal: 'indeterminate'

assessGsiSnapshot({ health: 50 });
// 记录缺失的位置/朝向，以及未知 ducked 和 native spatial correction。
// predictC4Outcome({ field, bombPosition, playerPosition, playerForward, ducked, health })
// 当前返回 { status: 'unavailable', reason: 'model-not-qualified' }。
```

`C4Outcome` 区分 `exact`、`bounded` 与 `unavailable`，绝不用零表示未知。
对于已经证明完整覆盖的伤害区间：最小伤害达到 HP 则确定致死；最大伤害小于 HP
则确定存活；跨越 HP 阈值则为 `indeterminate`。即使两端相同，也仍保留 bounded。
上下界必须覆盖所有相关未知量，枚举两个猜测不等于证明 envelope。
算术函数假定玩家存活且使用标准伤害规则；非法 HP/伤害范围返回 unavailable。
它本身不负责证明区间来源可靠。

GSI 入口只接收**已解码的 GSI-like 快照**，不是原始 Valve JSON parser。
它标记缺失字段，不编造 crouch；尚不验证 telemetry 数值、时效性、观察者覆盖或预测伤害。

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

单 package，strict TypeScript、tsup，根路径和 `/gsi` 均支持 ESM + CommonJS。
`/node` 与同 package CLI 只是未来选项，当前未导出。
CI 覆盖 Linux、Windows、macOS 上的 Node 22/24。
全部测试使用手工 synthetic fixtures，不需要安装 CS2。
真实资产验证应放入 gitignored `qualification/`，独立于确定性 CI。
详见[贡献指南](CONTRIBUTING.md)。

当前版本为 `0.0.0`，使用 `private: true` 防止误发布；没有 npm release。
正式授权发布前必须重新核验 npm 包名可用性。

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
