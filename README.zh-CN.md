# cs2-c4-damage

[English](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/README.md)

基于地图烘焙伤害场和 Game State Integration（GSI）快照，计算 CS2 C4 伤害、剩余 HP 和致死判断。

- 可复用的 GSI 预测器，支持站姿和蹲姿场景。
- 原生风格的 float32 运算、midpoint KD-tree 查询和两阶段采样。
- 资源提取、校验与 SHA-256 来源记录。
- 逐阶段 trace，方便检查和对照计算过程。
- TypeScript 类型、ESM/CJS 导出、CLI，零运行时 npm 依赖。

## 安装

CLI 和 Node 工具需要 Node.js 22 或更高版本。

```sh
npm install cs2-c4-damage@beta
```

核心库和 GSI 适配器为纯 TypeScript/JavaScript，也可打包到浏览器应用。
文件访问和反编译器调用集中在 `/node` 入口。

## 准备地图

使用 [Source 2 Viewer](https://s2v.app) 从本地 CS2 地图 VPK 中提取
`maps/<map>/baked_bomb_damage.vdata_c`，并保留对应的游戏 build 信息。游戏资源由应用自行提供。

CLI 可以调用本地 Source2Viewer-CLI，并将结果转换为标准 JSON：

```sh
npx cs2-c4-damage extract \
  --compiled /your/resources/baked_bomb_damage.vdata_c \
  --decompiler /your/tools/Source2Viewer-CLI \
  --decompiler-sha256 <反编译器可执行文件的SHA256> \
  --map de_mirage --build-id 25687242 \
  --out /your/resources/mirage.json

npx cs2-c4-damage inspect /your/resources/mirage.json
```

可用 `sha256sum`、`shasum -a 256` 或 PowerShell 的 `Get-FileHash -Algorithm SHA256`
计算可执行文件哈希。还可通过 `--client-sha256` 记录匹配的客户端二进制身份。
已有反编译文本时，用 `--vdata <文本文件>` 替换两个 `--decompiler` 选项。

build 身份、提取选项和地图更新方式见[资源指南](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/resources.md)。

## 接入 GSI

加载地图并创建一次预测器，在后续快照更新中复用：

```ts
import { readNormalizedField } from 'cs2-c4-damage/node';
import { createGsiC4Predictor, decodeGsiSnapshot } from 'cs2-c4-damage/gsi';

const field = await readNormalizedField('/your/resources/mirage.json');
const predict = createGsiC4Predictor(field);

export function handleGsi(payload: unknown, steamId?: string) {
  // steamId 选择 allplayers[steamId]；省略时选择 player。
  const result = predict(decodeGsiSnapshot(payload, steamId));
  if (result.status === 'conditional') {
    console.log(result.damage); // { min, max }：所计算场景的范围
    console.log(result.hpAfter, result.lethal);
    console.log(result.scenarios); // 各场景的姿态、伤害和采样 trace
  }
  return result;
}
```

在 GSI 配置中启用炸弹位置、玩家位置、朝向和血量所需的数据。字段可用性取决于 GSI
配置和观察视角。适配器接受坐标字符串或数值三元组，处理已安放／正在拆除的炸弹，
并在提供地图名时核对资源。GSI HTTP 接收服务由应用负责。

| 结果          | 含义                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| `conditional` | 所列场景的伤害和 HP 范围，以及 `lethal`、`assumptions` 和 `unknownInputs`。 |
| `unavailable` | 必要输入缺失或非法、资源身份不支持，或场查询无法完成；原因见 `reason`。     |

`lethal` 根据这些场景返回 `true`、`false` 或 `'indeterminate'`。
已解码的快照可直接传入预测器；单次调用也可使用 `predictC4OutcomeFromGsi(field, snapshot)`。

## 直接输入与采样

应用已经持有玩家和炸弹状态时，可使用核心 API：

```ts
import { createC4Predictor } from 'cs2-c4-damage';

const predict = createC4Predictor(field);
const result = predict({
  bombPosition: { x: 100, y: 200, z: 0 },
  playerPosition: { x: 150, y: 250, z: 0 },
  playerForward: { x: 1, y: 0, z: 0 },
  health: 100,
  ducked: undefined, // 计算两种姿态；已知时传 true/false
});
```

可选的 `nativeState` 提供碰撞边界／变换，以及地面结果或碰撞查询服务。
`runStaticSampling` 提供首次查询、二次查询、选中阶段和修正后伤害。
详见[模型与 API 指南](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/model.md)。

## CLI

```sh
npx cs2-c4-damage predict /your/resources/mirage.json \
  --bomb-position 100,200,0 --player-position 150,250,0 \
  --forward 1,0,0 --health 100 --ducked unknown

npx cs2-c4-damage compare-traces expected.json actual.json
npx cs2-c4-damage qualify vectors.json /your/resources/mirage.json
```

`predict` 输出 JSON；`compare-traces` 对照采样阶段并报告差异路径；
`qualify` 检查带版本信息的参考向量及资源身份。

## 开发与文档

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:package
```

- [文档索引](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/README.md)
- [架构](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/architecture.md)
- [更新日志](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/CHANGELOG.md)
- [贡献指南](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/CONTRIBUTING.md) · [发布流程](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/releasing.md)

新代码采用 Apache-2.0。原始研究来自 [unicbm](https://github.com/unicbm)，保留作者版权；
详见[致谢](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/CREDITS.md)。

## 精度说明

结果基于 `cs2-win64-2026-10-02-static-v2` 模型和匹配的地图资源。GSI 缺少部分姿态与碰撞状态，
地面重采样、动态障碍物或特殊变换等情况可能无法精确模拟。输出范围仅覆盖所列场景，
不涵盖全部未知状态；完整原生一致性尚待实机采集验证。
