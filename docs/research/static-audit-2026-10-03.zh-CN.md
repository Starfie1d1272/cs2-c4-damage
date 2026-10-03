# 2026-10-03：公开版本静态复核与隔离指令实验

> 后续实现已推进到 `cs2-win64-2026-10-02-static-v2`：新版建树/浮点运算、采样变换和
> 二次采样状态机已落地，GSI 可返回显式条件结果，通用来源自反编译和阶段对照也已实现。
> 下文保留前一轮静态审计时的进度；当前行为以 [model](../model.md) 和 README 为准。
> 实机采集按用户要求后置，`exact` 仍不产生。

本次已恢复 Steam 获取链路，下载新版本二进制并完成新的反汇编。玩家采样点、
二次采样控制流、地面查询的形状构造和部分过滤输入有了可复现证据。
**这不等于完整外部模型或实机 qualification：主接口继续返回 `model-not-qualified`。**

当前工作区基线为 `8276efe`，不包含上次会话提及的审计文件及负例验证修复。
本次在该基线上补回修复，并继续研究；未覆盖原始研究 Markdown。

## 获取链路与版本

Steam Directory API 返回 200，DepotDownloader 3.4.0 经代理的 WebSocket 返回 101，
匿名登录成功。旧 Windows manifest `5806169188224907599` 未获得 request code，
Steam CDN 返回 401；这是匿名旧版本访问限制，不是原来的网络策略 403。
因此没有用新 DLL 冒充旧研究所用的 DLL。

本次下载固定为以下两个公开 manifest：

- App 730 / Windows depot 2347771：`846540275648835184`。
- App 730 / common depot 2347770：`2625928478418236338`。

第三方 [SteamCMD appinfo API](https://api.steamcmd.net/v1/info/730) 在本次检索中将这两份
manifest 对应到 public build `25687242`。该 build ID 是辅助来源，二进制结论以本表
SHA-256 为准。直接下载的 `steam.inf` 为 ClientVersion/ServerVersion `2000924`、
PatchVersion `1.41.8.8`、SourceRevision `11076591`，VersionDate `Oct 02 2026`。

| 文件                      |      字节数 | SHA-256                                                            |
| ------------------------- | ----------: | ------------------------------------------------------------------ |
| client.dll                |  39,183,000 | `d7db25d48f1d10c5e0b0296e20ed803426eb9509da41760daeda39dd35ba89b9` |
| server.dll                |  34,652,824 | `098d4ddd57e2fbe9a73623a2bf68ebaff86f7b6342ddb3d5a0f69cd6335b31cc` |
| tier0.dll                 |   3,979,416 | `4e0dcb0af3f6953f37ddaed0f4e67a56d031f1e84964a262148f8a6f80547791` |
| de_mirage.vpk             | 176,187,297 | `e66cdf1ae6a976f6f6ba510a2addd04b25a4c1cfd811f51f1ef13f0954e6e350` |
| baked_bomb_damage.vdata_c |     713,263 | `6f11916a6e4f133a2e4f64af192fae9a0cdfdac64eebaeed4ab7a2d66581481a` |
| 反编译文本                |   2,957,815 | `cd9526bc4cca227ff22430846a70a9759e2b7043f8a3a182e2598bb49ec46381` |

Valve 文件、反汇编、下载日志及生成结果仅保存在忽略目录 `qualification/` 和
`.agent-tmp/`。没有游戏进程、注入、hook、真实遥测或发行操作。

## 函数定位与工具限制

原报告入口特征在两个新 DLL 的可执行段各唯一匹配一次；继续检查整个控制流，
而不是仅凭签名认定语义一致。下列均为 RVA，不是可直接执行的运行时地址：

| 用途              | client.dll             | server.dll             |
| ----------------- | ---------------------- | ---------------------- |
| 完整 C4 query     | `[0x80CCF0, 0x80D015)` | `[0x9FB090, 0x9FB3B5)` |
| 地图系统 getter   | `0x854310`             | `0xA3DAB0`             |
| field sampler     | `0x84F770`             | `0xA39F10`             |
| pawn 虚采样槽     | `vtable + 0x2B0`       | `vtable + 0x2C8`       |
| pawn 虚采样实现   | `0x16D730`             | `0x15AA70`             |
| scene-node origin | `0x2197E0`             | `0x3D0410`             |
| 地面 helper       | `0x8E72A0`             | `0xADEA70`             |
| hit predicate     | `0x360480`             | `0x2BCDD0`             |

PE exception/unwind 表会把同一逻辑函数拆成多段；例如 client 的第一段到
`0x80CF2E`，并不是函数结束。只导出第一条 runtime-function entry 会漏掉伤害修正、
成功返回等路径。本次按跳转目标和完整 epilogue 补齐。

RTTI 的主 vtable 定位：client `C_CSPlayerPawn` 为 `0x1C87348`，
server `CCSPlayerPawn` 为 `0x178C0C8`。继承对象的次级 vtable 不能套用主表槽号。

## Q1：玩家原生采样点

客户端完整调用链为：

```text
query → pawn[vtable + 0x2B0] → 0x16D730
  collision = pawn[vtable + 0x218]()  // 0x167180: pawn + 0x340
  if collision == null:
      sample = absolute scene-node origin
  else:
      localCenter = float32((mins + maxs) * 0.5)  // 0x1667B0
      sample = collisionLocalToWorld(localCenter) // 0x15EB40
```

`mins/maxs` 来自 collision 对象 `+0x40/+0x4C`。转换读取 collision `+0x5B` 的
`0xFD` 掩码和 scene-node 的角度/缩放：轴对齐或零角路径为
`origin + scale * localCenter`；旋转路径使用绝对变换中的 quaternion、scale 和 translation。
`0x218630` 取 scene-node `+0x10` 的变换；origin 在 `+0xC8`，角度在 `+0xD4`，
scale 在 `+0xE0`。节点 dirty 时先走原生更新函数，不能忽略这一状态。

服务端对应实现也先取碰撞对象，再计算中心和转换；本次的数学执行实验限于客户端。
已用真实客户端指令验证：无碰撞对象、两种高度包围盒、旋转加缩放、轴对齐五个合成场景。
使用非零中心 x/y，避免对称包围盒掩盖旋转错误。

因此不能把第一点认作固定的 `GSI position + 36`，也不是已证明的 eye position。
还需要实时碰撞包围盒、绝对变换及其更新状态。实验中的高度不是通用姿态常量。

## Q2：两次不同的碰撞查询

`pawn + 0x1330`（server `+0xB50`）是本路径的 movement-service 指针，
不应与 Q1 的 collision 对象指针混为一谈。

1. 第一次 field sampler 除伤害和方向外，还写出**被选中的烘焙节点坐标**。
   query 先从原生 sample point 向该节点做零半径查询；参数包含空忽略实体和 mask `1`。
   wrapper 构造的过滤对象 group byte 为 `3`。无命中则不进行地面重采样。
2. 地面 helper 从 pawn absolute origin 向下扫，不是从第一采样中心开始。
   下扫长度是调用方传入的 `float32(2 * g_flConfigMaxCoord * sqrt(3))`；本 DLL
   中 `g_flConfigMaxCoord` 初值为 16384，但它是读取的配置变量，不能硬编码为玩家高度。
3. 地面形状由一组原生 hull 定义选取：普通、`movement + 0x408` 为真、以及另一项
   pawn-service predicate 的特殊分支。特殊分支优先。bounds 不同则 shape type 为 `2`，
   完全相同则退化为 type `0`。底层函数字符串明确为 `TraceShape`。
4. 地面 filter 构造器 `0x8BD9B0` 消费 pawn、pawn 虚槽 `+0x9F8` 返回的 mask 和 group `11`。
   对本次 `C_CSPlayerPawn`，该槽实现返回 `0xC3011`。构造后 filter 的 `+8/+0x10/+0x18`
   三个 uint64 值分别是 `0xC3011 / 0x48100 / 0x40000`，不是把三者简单 OR 成一个 mask。
   还设置 pawn/owner handle、碰撞组与虚过滤回调；这些依赖实体及物理系统状态。
5. 两次查询共同的 hit predicate 为 `fraction(+0xAC) < 1 || byte(+0xBB) != 0`。
   本文不在缺少进一步类型证据时把该 byte 命名为某个具体 solid 状态。
6. 地面 helper 无论 hit predicate 真或假，都会先将 trace end-position 的 z（`+0x8C`）
   写入输出。query **只在 helper 返回真时使用它**，不能因为 correctionZ 有值就认定命中。

六个合成指令实验覆盖普通/蹲姿/特殊 hull 选择、退化形状、miss 和 solid flag。
执行真实 helper、形状与过滤对象构造指令；物理引擎结果、hull 定义和部分实体身份服务是桩。
这证明调用契约及分支，不证明地图碰撞求交、动态道具或过滤回调已在外部实现。

## Q3：二次采样的状态机和失败优先级

以下控制流已在 client/server 两边用原始查询指令和受控 callee 输出复现：

```text
if target absent or field system absent: return false
p1 = nativeSample(target)
if !field(bombOrigin, p1, damageOut, directionOut, nearestNodeOut): return false

if both pawn virtual predicates permit:
    if movement service exists
       and movement-type predicate is false
       and related-entity predicate does not suppress the branch:
        if trace(p1, nearestNodeOut).hit:
            if groundHelper(movement, downwardLength, groundZ):
                p2.x = p1.x
                p2.y = p1.y
                p2.z = float32(float32(p1.z - pawnAbsoluteOrigin.z) + groundZ)
                field(bombOrigin, p2, SAME damageOut, SAME directionOut, nearestNodeOut)
                // 第二次返回值不参与 query 的返回值或选择逻辑。

apply the allowed player correction if damageOut < 100
return true
```

客户端两个 pawn 虚 predicate 槽分别为 `+0x4F0/+0xAB8`，本次 CS pawn 的实现均返回真。
movement-type helper 比较 pawn `+0x526` 是否等于 `9`。
related-entity 通过 pawn `+0x5C0` → `+0x5C8` 解析 handle，再调用其 `+0x500` predicate；
本轮未将这些槽的含义扩展为对全部实体类/模式的承诺。

第二次 sampler 成功会覆盖同一输出缓冲区；失败路径在写 damage/direction 之前退出，
所以保留第一次结果，之后仍可能应用玩家修正。没有取 min/max，没有失败即 query false，
也不是以 `groundZ` 直接替换 `p1.z`。地面输出哨兵初始化为 FLT_MAX，但成功之后不另作哨兵检查。

26 个 query 实验覆盖两模块各 13 个分支，检查调用顺序、两次坐标、成功位、伤害和方向。
为隔离采样控制流，成功的桩伤害选为 150/120，未进入 `<100` 的姿态/朝向计算；
不将这些实验计作玩家修正或真实 field sampler 验证。

## Q4：最近节点、重叠区域和新发现的方向角差异

field sampler 调用 tier0 导出 `CVertexKDTree::Nearest`。本次 tier0：入口 `0x17FBD0`，
递归实现 `0x180020`。距离的减法、平方和加法均为 float32；只有严格更近才覆盖候选。
先遍历查询点所在侧，split-plane 相等时先右侧；只有最佳距离严格大于到分割平面的
平方距离时才搜索另一侧。等距结果因此依赖建树分区和遍历顺序，不是全局最小资源索引。

三个使用真实 `NearestInternal` 指令、合成树的实验验证：叶节点先遇到者保留、
交换叶中指针次序会改变结果、split-plane 平局可以选原索引 1 而不是 0。
这些实验没有执行实际资源的原生建树过程。要在外部完整复制结果，仍须复刻和验证建树、
分区、重复坐标映射及 float32 运算；仅把线性扫描改成 float32 不够。

客户端 bombsite 选择 `0x849280` 顺序扫描，每个轴 inclusive，返回首个匹配区域。
这为本版本的 first-overlap 规则提供了静态支持；不替代加载期 bounds 扩展及多地图验证。

**现有模型与本次 DLL 有直接矛盾：方向角分母是 255，不是 256。**
client `0x84F91D/0x84F930` 读取 `0x1AC7F3C = float32(255)`，server
`0xA3A0F8/0xA3A10B` 读取 `0x1782E18 = float32(255)`，再乘 360 度。
不能将仓库 `external-static-v1` 的 `/256` 解码宣传为这两个 DLL 的精确实现。
原报告二进制未取得，无法确定这是何时变更，还是早期外部模型推导就不正确。
本次没有偷偷改写旧 model revision；下一实现必须明确绑定新语义及浮点行为。

## 资源来源配对

本次实际从固定 common manifest 的 `de_mirage.vpk` 提取
`maps/de_mirage/baked_bomb_damage.vdata_c`，然后直接对该文件反编译。
工具为 Source2Viewer-CLI `20.0.6980+a06886f7d06049052d32a7381ec05523064a2ca0`，
Linux 可执行文件 SHA-256 为
`1c43b87e0bda995c0e1f2df8828c64510e3dd6fed32038ea9870aafa9801a5a4`。
工具由 [VRF release 20.0](https://github.com/ValveResourceFormat/ValveResourceFormat/releases/tag/20.0)
获取，未复制其实现代码或测试资产。该 executable revision 不应写成旧文档中的另一 revision。

重复反编译后逐字节比较相同。现有 parser 成功解析资源 version 2、2 个包区、
68,279 个节点、136,558 条记录。canonical normalized payload SHA-256 为
`390f2a7baceb077ea36bb83164b2f682359564d224fd8b1965d053adfc559459`。

这是**本次人工审计的来源链**。通用 Node extractor 仍接受调用方分别提供的 compiled/text，
不能以此把所有提取结果标成已配对；它的 `unverified-source-pair` 状态保持不变。
资源配对、DLL/build 配对、完整算法 qualification 是不同问题。

## 可重复实验

在自己的固定版本资源上执行：

```sh
uv run scripts/research/probe_native_query.py qualification/current-windows \
  > qualification/current-windows/synthetic-replay.json
```

脚本只接受上表三个 DLL 的 SHA-256，依赖版本锁定在脚本元数据中。
所有机器指令从用户自己的 DLL 读取，仓库不包含它们；脚本没有注入、网络请求或实机执行。
对未建模的指令地址立即失败，限制指令数；输出显式 `qualified: false`。
样本变换实验允许 `1e-5` 的检查误差，其余分支/离散输出检查为精确比较。
该容差仅用于此数学实验，不是 native qualification 接受标准。

本次 **40 个实验全部通过**：26 query + 5 sample transform + 6 ground-helper + 3 nearest。
这与 pnpm 的合成单元测试是不同的证据集。

当前检出基线加本次修改的 20 项 Vitest 测试，以及 `pnpm lint`、`pnpm typecheck`、
`pnpm build`、`pnpm test:package` 均通过。原始研究 Markdown 的 SHA-256 仍为
`e3d85e2c9c4625c3fed0b9a5c58136caf299c0ec4ae2831e5febdd4b9ab6a831`。

## 交付边界与后续顺序

1. 本次已补回负例漏洞修复：模型 `unavailable` 不能计作 native false 匹配。
   混合正负例只要有未解决案例就不通过；failure reason 文本不是成功证据。
   修正根级忽略规则，使 `src/qualification/` 被源码检查覆盖。
2. 原生采样和重采样状态机已有上面的独立证据，尚未接入主预测器。
   下一模型应同时处理 `/255`、float32、KD-tree 建树及重复坐标，避免仅修一个分支后解锁。
3. 需要真正的地图碰撞与同步实体状态提供者；当前场资源加 GSI 不足以实现 Q2。
   仍须还原和验证物理层过滤回调/碰撞组规则及特殊 hull predicate。
4. 通用资源配对要由受控反编译流程产生可检查证据；本次手工链不能成为用户设置的资格开关。
5. 最后捕获同 build 的真实逐阶段 trace 和实际施伤结果，覆盖姿态/朝向、斜面/台阶、
   起始 solid、动态物体、等距/重复点、失败路径及地图切换。现有 harness 仍只比较最终结果，
   完整模型实现后还需逐阶段差分及覆盖门槛；不能把本脚本的 callee 桩输出当作实机输入。

**不需要先有 Windows 才能继续静态研究；但开放外网本身不会产生原生运行证据或补齐 GSI 状态。**
本次未新增 `exact` 输出，未发布 npm、release 或提交任何 Valve 资产。

## 同日实现跟进

新增 `scripts/research/probe_static_model.py` 执行真实 BuildMidpoint 和 Nearest，
覆盖 183 次查询；客户端原生 Bias/remap 覆盖 400/72 组输入；tier0 的真实 CRT sin/cos
覆盖 256 个编码角。TypeScript 新模型与这些合成输出全部无容差匹配。
建树分区是从中点开始的双向两轮交换，不是 sort 或稳定 partition；轴 tie、8 点叶阈值、
float32 midpoint、严格更近替换及 plane pruning 均已实现。重复点的树查询可复现，
但冲突记录的坐标映射未完全还原，所以场模型明确拒绝重复坐标，而不是猜记录。

默认 parser 使用新版 model revision；已知不同 build/client 被拒绝，未知身份显示在结果。
GSI 路径现在返回 `conditional`，包括关联的站姿/蹲姿采样场景、数值、假设和未知项。
场景范围不是原生完整上下界。提供有效 nativeState 或符合契约的 collision provider 可以
替换采样/碰撞假设；没有 provider 时并不伪造“无遮挡”。库不包含地图物理实现。

自反编译器实际读取自己运行工具产生的文本，记录 `self-decompiled-source-pair` 和工具 hash；
已对本次私有 Mirage 资源跑通，compiled/text/normalized hashes 与上表一致。
`compareSamplingTraces` 及 CLI `compare-traces` 可以逐阶段比较完整证据，缺失阶段不通过。
原有最终 native qualification harness 不将这些条件结果当作 exact。

交付验证：36 项测试及 lint、typecheck、build、test:package 全部通过。
使用上述 68,279 节点 Mirage 场和 20 组人工构造 GSI 快照完成端到端检查，均返回
带两个姿态场景的条件结果；这些输入不是实机遥测。完整阶段 trace 的 CLI 自对照
匹配 15 个字段，仅验证工具链，不作为原生一致性证据。真实资源和端到端输出留在
被忽略的 qualification/ 下；原始 unicbm 研究文档 SHA-256 保持不变。
