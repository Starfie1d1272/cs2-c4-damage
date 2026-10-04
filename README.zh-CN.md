# cs2-c4-damage

面向自定义 CS2 HUD 的即插即用 C4 伤害预测库。运行时无需安装 CS2、提取游戏资源或联网。

[![npm version](https://img.shields.io/npm/v/cs2-c4-damage?logo=npm)](https://www.npmjs.com/package/cs2-c4-damage)
[![CI](https://github.com/Starfie1d1272/cs2-c4-damage/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Starfie1d1272/cs2-c4-damage/actions/workflows/ci.yml)
[![Code license: Apache-2.0](https://img.shields.io/badge/code_license-Apache--2.0-blue)](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/LICENSE)

[English](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/README.md) · [文档](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/README.md) · [更新日志](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/CHANGELOG.md)

为 HUD 和赛事直播叠加层提供伤害、爆炸后剩余 HP 与致死判断，按站立状态估算。

- **内置 10 张地图**，自动选图、按需加载并复用计算器。
- **支持 GSI**，从 Game State Integration 快照读取炸弹与玩家状态。
- **零运行时 npm 依赖**，提供 ESM/CJS 导出和 TypeScript 类型声明。
- **接入现有 HUD**，GSI 接收服务与画面展示由你的应用负责。

## 安装

```sh
npm install cs2-c4-damage
```

自动资源加载需要 Node.js 22+。核心库与 GSI 适配器为纯 TypeScript/JavaScript，
提供 ESM/CJS 导出和类型声明，零运行时 npm 依赖。

## 快速接入

```ts
import { createBundledGsiPredictor } from 'cs2-c4-damage/node';
import { decodeGsiSnapshot } from 'cs2-c4-damage/gsi';

const c4 = createBundledGsiPredictor();

export async function handleGsi(payload: unknown, steamId?: string) {
  const result = await c4.predict(decodeGsiSnapshot(payload, steamId));
  if (result.status === 'predicted') {
    console.log(result.damage); // HUD 显示的单个站立伤害值
    console.log(result.hpAfter, result.lethal);
  }
  return result; // status 为 unavailable 时隐藏预测
}

// 回合结束、数据断开或来源重启时调用：
export function resetC4() {
  c4.reset();
}
```

`steamId` 选择 `allplayers[steamId]`，省略时使用 `player`。GSI 需要提供地图名、已安放／
正在拆除的炸弹位置、玩家位置、朝向和血量。GSI 接收服务和 HUD 展示由应用负责，
显示处用“按站立估算”这样的简短提示即可。

服务自动选图、读取内置伤害场，并在后续更新中复用计算器。默认最多缓存两张地图，
换图或 reset 后会丢弃旧的异步结果；输入缺失或地图不支持时返回 `unavailable`。
运行时不需要本地 CS2 安装、提取工具、手动下载资源或联网请求。

## 精度说明

HUD 数值按站立状态估算。缺失的碰撞／姿态状态及游戏更新可能使结果与实际伤害不同，
不承诺实战完全精确模拟。

## 内置地图

Ancient、Anubis、**Cache（叉车）**、Dust II、Inferno、Mirage、Nuke、Overpass、Train、Vertigo。
内置加载器接受 `de_cache` 这样的标准名称，也接受 `cache` 这样的简称。
压缩后的数值表合计约 9.4 MiB，随 npm 包提供，按地图按需加载；导入核心库不会读取地图文件。

地图数据与模型版本在包内部配对，资源更新随库版本交付。
版本清单及维护者的批量生成流程见[资源指南](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/resources.md)。

## 分离资源加载与计算

采用 Companion/Core 分层的应用，可以在 Node 侧加载资源，再由负责计算的模块创建预测器：

```ts
import { loadBundledMap } from 'cs2-c4-damage/node';
import { createStandingGsiPredictor } from 'cs2-c4-damage/gsi';

const field = await loadBundledMap('de_cache');
const predict = createStandingGsiPredictor(field);
// 为每个玩家复用计算器，换图时重新创建。
const result = predict(snapshot);
```

核心入口的 `createStandingC4Predictor(field)` 接受炸弹／玩家坐标、朝向和血量。
站立预测接口返回：

| 状态          | 字段                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| `predicted`   | 数值 `damage`、`hpAfter`，布尔值 `lethal`，`stance: 'standing'`，模型身份与假设。 |
| `unavailable` | `reason`；HUD 可以隐藏该值。                                                      |

原有 `createC4Predictor` 和 `createGsiC4Predictor` 多场景接口仍可使用。
高级调用方还可提供原生采样／碰撞状态、查看阶段 trace，详见
[模型与 API 指南](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/model.md)。

## 数据与工具

`cs2-c4-damage/maps` 导出 `bundledMapManifest`、`packMapField` 和 `unpackMapField`，
方便应用管理资源。`loadBundledMap` 返回数据前会检查压缩文件哈希、元数据和标准化场身份。

CLI 保留 `extract`、`inspect`、`predict`、`compare-traces` 和 `qualify`，用于自定义资源和研究。
提取属于维护者／高级工作流；普通 HUD 接入直接使用内置地图。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:package
```

[文档](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/README.md) ·
[更新日志](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/CHANGELOG.md) ·
[贡献指南](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/CONTRIBUTING.md) ·
[发布流程](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/releasing.md)

原创代码采用 Apache-2.0，原始研究来自 [unicbm](https://github.com/unicbm)。
内置数值地图表由 CS2 数据生成，源游戏材料的权利仍归相应权利人所有。
详见[致谢](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/CREDITS.md)和
[NOTICE](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/NOTICE)。
