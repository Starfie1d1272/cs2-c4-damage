# C4 预计伤害：原生函数与 HUD 接入审查

2026-09-17；本机 Windows x64，Ghidra 12.1.2 + Capstone + PE unwind 交叉复核。函数名除原生字符串/类型名外均为研究命名。

**结论：函数已找到，客户端和服务端都有。导播客户端优先调用 `client.dll+0x7E7420`；官方预期血条就在使用它。它按指定 C4、指定实体的当前状态返回整数伤害，已包含姿态/朝向修正。标准新版 C4 忽略护甲，可以据此算剩余血量和是否致死。**

## 1. 定位与版本

以下全部为 **RVA**；实际地址是对应模块的加载基址加 RVA，不能直接使用 PE preferred base `0x180000000`。

| 用途 | client.dll | server.dll |
|---|---:|---:|
| **单实体预计伤害查询，推荐调用** | **`0x7E7420`** | **`0x9CE9A0`** |
| 底层地图场采样 | `0x828530` | `0xA0BD40` |
| 已加载地图伤害系统 getter；无数据返回空 | `0x82CCE0` | `0xA0F370` |
| 官方预期血条更新 | `0xE23380` | — |
| 真正向单实体施加 C4 伤害；不要用来预测 | — | `0x9C3BC0` |
| 爆炸后冲击波推进、逐目标施伤 | — | `0x9CB770` |

文件来自本机 `C:\SteamLibrary\steamapps\common\Counter-Strike Global Offensive\game\csgo\bin\win64\`，本轮重新计算：

```text
client.dll  37585560 bytes
SHA256 a0c195f0b6ec00915ef08c548200a010ebbe7982d3a4bc468cad939b67c8c4e3
server.dll  33042584 bytes
SHA256 1cac9113b10037c0ba8fb739e5538c21d7ddaee5529325ca4f7e9a241fad43cc
```

两个查询函数的相同入口字节，在各自模块可执行段内均**唯一匹配一次**：

```text
48 89 5C 24 08 48 89 74 24 18 55 57 41 54 41 56
41 57 48 8D 6C 24 C0 48 81 EC 40 01 00 00
```

这是当前构建的定位证据，更新后需复核。完整函数范围：client `[0x7E7420,0x7E7745)`；server `[0x9CE9A0,0x9CECC5)`。Linux 未审计。

## 2. 可调用 ABI

```cpp
struct Vec3 { float x, y, z; }; // 12 bytes
using QueryC4Damage = bool (__fastcall*)(
    void* plantedC4,       // RCX: client C_PlantedC4* / server CPlantedC4*
    void* targetEntity,    // RDX: 对应模块中的玩家 pawn*，不是 controller*
    uint8_t* damageOut,    // R8:  1 byte，0..255
    Vec3* blastDirOut      // R9:  12 bytes，冲击方向
);
```

返回值读取 **AL**；不是返回伤害的 float。C# 原生声明可用 `byte` 返回值避免 bool 宽度问题。两个输出都传有效缓冲区并初始化。`false` 表示没有取得有效场查询结果，不能当作“安全、0 伤害”；`true && damageOut==0` 才是本次查询的零伤害。

查询内部没有“只准查询本地玩家”的检查，也没有用剩余爆炸时间乘算伤害。调用方负责提供有效、存活的相关玩家与当前有效 C4；客户端/服务端对象不能混用。查询不执行扣血、爆炸或事件派发，但含引擎虚调用、碰撞查询和服务访问，应在对应游戏线程调用。

## 3. 实现要点

原生 `CMapBombDamageGameSystem` 加载 `maps/<map>/baked_bomb_damage.vdata`。服务端解析器 `0xA1A810` 接受格式版本 1/2，读取 `bombsites`、`positions`、`damage_values`，构建位置索引和 KD-tree。

- 先以 **C4 世界位置落入哪个 bombsite AABB** 选择场；加载时边界向外扩 32 单位。同一 AABB 内并非围绕每个实际落包点重新模拟。
- 按目标实体的原生空间采样点查 KD-tree 最近节点，取该节点对应包区的记录；不是单纯欧氏距离高斯伤害，也不是实时从 C4 向每人打一条直线。
- 服务端记录为 4 字节：前 2 字节标量、后 2 字节方向角；底层将标量结合包区参数换算为伤害，截断并限制到 `0..255`。不能把文件前 2 字节直接当作 HP。
- 实体级查询另有碰撞/地面高度修正，可能二次采样，然后处理玩家蹲姿及朝向。直接调用底层场函数会漏掉这些步骤。

实体修正的等价逻辑如下；两个模块的常量和分支均已核对。`D` 每一步都截断为整数，`forward` 来自玩家原生视角，`dir` 来自场：

```text
先查询地图场（必要时按原生地面修正重采样）；失败 → false
若目标是 CS 玩家且 D < 100：
    若 MovementServices.m_bDucked：D = Scale(D, 0.45)
    t = clamp((dot(dir, forward) + 1) / 2, 0, 1)
    D = Scale(D, 0.53 - 0.06*t)
返回 true

Scale(D, b) = clamp(trunc(100 * Bias(D/100, b)), 0, 255)
Bias(x, b) = x / ((1/b - 2)*(1-x) + 1)  // 此处 x∈[0,1]，b∈[0.45,0.53]
```

因此 **蹲姿的 `0.45` 是非线性 Bias 参数，不是伤害乘 0.45**；原始结果 `D>=100` 时跳过这组玩家修正。接入时复用查询即可，不必复制这些数学和私有字段。

## 4. 血量与 hook 的实际落点

**官方 HUD 的直接证据：** `client+0xE23380` 在 `+0xE23597` 调用 `+0x7E7420`，随后将伤害限制到当前 HP，换算血条。它有单独的显示资格函数 `+0xC6A740`，且当前 HUD 目标来自 `+0xC297F0`。UI 为可见性保留的最小血条宽度也不应反推成真实剩余 HP。

**服务端的直接证据：** `server+0x9CB770 → +0x9C3BC0 → +0x9CE9A0`；施伤函数把输出 byte 转 float，构造 `DMG_BLAST=0x40`，再给 `CTakeDamageInfo+0x70` 加 `0x40000`。本 DLL 枚举项 `+0x16A2670` 明确把该位命名为 **`DFLAG_IGNORE_ARMOR`**。之后 `+0x9C3FF8` 调用 `+0x3E5660` 进入通用伤害链。不要套旧 C4 的护甲公式，也不要照抄旧 SDK 中该 flag 的数值。

标准规则、无无敌/自定义伤害修改时，逐人输出即可：

```cpp
uint8_t d = 0;
Vec3 dir{};
if (!query(bomb, pawn, &d, &dir)) return Unknown;
int damage = int(d);                     // 原生预测伤害
int hpAfter = std::max(0, hp - damage);
int hpLost = std::min(hp, damage);        // HUD 若显示实际损失 HP
bool lethal = hp > 0 && damage >= hp;
```

**建议实现：** 在已有游戏帧回调中，以同一帧的 C4/玩家快照逐人调用，按 HUD 需要节流；5–10 Hz 可作为起始频率，开销需现场量测。只 hook 官方查询的返回值通常只覆盖当前 HUD 目标；只 hook 服务端施伤则要等真正爆炸，拿不到提前预测。已有帧回调时，功能本身无需额外 detour；若确需 hook，查询函数 post 可捕获其指定目标、成功位和输出，不能用它代替全员主动查询。

将 `tick/time、bomb handle+serial、player handle+serial、valid、damage、hpAfter、lethal` 作为 HUD 数据边界。地图切换、回合重置、demo seek 后重新取得实体和地图状态。纯 demo/GSI 外部进程不能直接调用这里的地址；需要运行在已加载地图的 CS2 客户端或服务端中的桥接。客户端预测以其实际拥有的玩家状态为准，不能保证缺失/过期的远端状态等于服务端真值。

## 5. 审查结论与复核边界

- **静态闭合：** 官方血条 → 客户端查询；服务端冲击波 → 同语义查询 → 忽略护甲的实际伤害链；ABI、整数输出、失败返回、姿态/朝向处理、当前构建唯一入口均已复核。
- **时间含义：** 输出是“保持当前状态时的预计 C4 伤害”。实际冲击波会推进，命中前的移动、转头、蹲起、其他伤害可改变结果；不是未来死亡的无条件保证。
- **数据缺失：** 原生爆炸入口 `server+0x9E9570` 在没有场时另走旧式 radius-damage 分支；上述查询会失败。需要兼容无烘焙场地图时应另做 fallback，不应悄悄报 0。
- **未做：** 实机安装 hook、逐玩家预测与爆炸实扣对照、GOTV/demo seek 稳定性与频率性能测试。本轮仅交付反编译审查，没有修改插件、游戏 DLL 或运行时 gamedata。

本机离线证据保留在忽略目录 `tmp/c4-damage/`：`client-query.md`、`client-hud.md`、`predict.md`、`field.md`、`query.md` 及同名汇编目录；原始反编译类型以本文经汇编核对的 ABI 为准。可用现有 `tools/research/native-ai/native_inspect.py` 重跑 `--function`、`--xref`，以及 `tools/research/c4/ExportC4.java` 重新导出。入口函数体 SHA256：

```text
client query bcf820538b9579726e7c7289d7288d69393594793a61876ffea7d26c4aa64261
server query c9426ec39711b7f4a705dd292e640f59426883f112c8c9655e9dd59a18225a43
```

背景核对：[Valve 官方更新记录](https://www.counter-strike.net/news/updates-t%C5%91l?l=english)，2026-07-08 预计算场与推进冲击波、07-09 移除全图最低 1 点伤害、07-20 调整伤害预览出现时机。函数位置和实现结论来自上述本地二进制。
