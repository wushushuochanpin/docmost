# 左侧菜单栏视图模式统一重构方案

> **2026-10-19 实现纠偏：** 本文下方“grid 直接复用 DocTree”的设计已被实际回归证明不成立，不能继续作为实现依据。`DocTree` 是固定行高的一维虚拟树；二维卡片必须由 `SidebarNodeGrid` 负责 CSS Grid、网格命中测试和同级排序。两种容器只共享 `SpaceTreeNode`、`DropOp` 和移动回调，不共享定位算法。当前代码是此边界的事实来源。

> 目标：把「列表 / 网格 / 胶囊」三种侧边栏渲染收敛为「数据适配 + 布局专用容器 + 节点外观」三层结构；共享节点数据和移动契约，但由各容器负责自己的布局与拖拽几何。

## 一、现状问题（盘点结论）

- 数据层统一（`useGetRootSidebarPagesQuery → buildTree → treeDataAtom`），渲染层三分：
  - 列表：`DocTree` + `SpaceTreeRow`（全功能）
  - 网格：`SpaceGridView`（独立写死，无拖拽/菜单/键盘）
  - 胶囊：`PinnedPagesSection`(showHeader=false) + `PinnedChip`（原生 HTML5 DnD，仅排序）
- 具体缺陷：
  1. 网格、胶囊未复用 `SpaceTreeRow`，各自写死 `<Link>` + 图标 + 标题
  2. 拖拽两套系统：`doc-tree-row.tsx` 用 pragmatic-drag-and-drop，`pinned-pages-section.tsx` 用原生 HTML5 DnD（注释自认）
  3. `PinnedPagesSection` 一个组件内双路径：`showHeader` 切换 DocTree 树形 / chips 胶囊
  4. 布局切换按钮仅在 `sidebarView === "all"` 渲染（`space-sidebar.tsx` L186），置顶 tab 固定胶囊
  5. 能力断层：同样的节点，列表全功能、网格纯展示、胶囊仅排序

## 二、目标架构

```
数据适配层           集合容器层               行外观层
treeDataAtom ──►  SidebarCollection ──►  SidebarNodeCard(variant)
pinnedRoots 过滤     ├─ list  → DocTree      ├─ list : 箭头+缩进+菜单
                    ├─ grid  → DocTree      ├─ card : 卡片(emoji+标题)
                    └─ chips → flex-wrap    └─ chip : 胶囊(emoji+标题)
                                          （三者共享 NodeMenu / EmojiPicker / 标题）
```

## 三、接口设计

### 1. 类型层（`features/page/types/page.types.ts`）

```ts
export type SidebarLayoutMode = "list" | "grid" | "chips";

export type SidebarView = {
  scope: SidebarViewMode;    // "all" | "pinned" | "category"，决定数据范围
  layout: SidebarLayoutMode; // 决定渲染形态，不再按 scope 硬编码
};
```

### 2. 统一容器 `sidebar-collection.tsx`（新增）

```tsx
interface SidebarCollectionProps {
  nodes: SpaceTreeNode[];
  layout: SidebarLayoutMode;          // list | grid | chips
  openIds: ReadonlySet<string>;
  selectedId?: string;
  readOnly: boolean;
  onToggle: (id: string, isOpen: boolean) => void;
  onMove: (sourceId: string, op: DropOp) => void | Promise<void>;
  allowNesting?: boolean;             // grid/chips 默认 false → blockMakeChild
  allowReorder?: boolean;             // 是否允许排序拖拽
  virtualize?: boolean;               // 节点多时才虚拟化
}
```

内部三态分发：
- `list` → `<DocTree data={nodes} renderRow={listRow} />`（现状不变）
- `grid` → `<DocTree data={nodes} openIds={∅} renderRow={cardRow} blockMakeChild allowReorder />`
  凭 `flattenVisible` 天然只渲染根节点，**白拿虚拟滚动 + 键盘导航 + 拖拽排序**（网格从纯展示升级）
- `chips` → 轻量 flex-wrap（节点数受 `PINNED_PAGES_LIMIT=10` 约束，无需虚拟化），
  行内拖拽改用 `useSidebarDnd`（pragmatic-dnd），**删除原生 HTML5 DnD**

### 3. 行外观 `sidebar-node-card.tsx`（新增，从 SpaceTreeRow 抽取）

```tsx
interface SidebarNodeCardProps {
  node: SpaceTreeNode;
  variant: "list" | "card" | "chip";
  readOnly: boolean;
  selected?: boolean;
  // 仅 list 需要：
  level?: number;
  isOpen?: boolean;
  hasChildren?: boolean;
  toggleOpen?: () => void;
  // 拖拽态（useSidebarDnd 注入，三变体一致）：
  isDragging?: boolean;
  isReceivingDrop?: "before" | "after" | null;
}
```

- 三变体共享：图标/EmojiPicker、标题、`NodeMenu`（右键菜单）、（可选）创建子页
- `space-tree-row.tsx` 变薄为 list 外观壳（箭头 + 缩进 + Link 语义），内容复用本组件

### 4. 拖拽统一 `hooks/use-sidebar-dnd.ts`（新增）

```ts
function useSidebarDnd(
  node: SpaceTreeNode,
  opts: {
    allowNesting: boolean;
    getRootData: () => SpaceTreeNode[];
    onMove: (sourceId: string, op: DropOp) => void;
    contextId: symbol;
  },
): { isDragging: boolean; isReceivingDrop: "before" | "after" | null }
```

- 把 `doc-tree-row.tsx` L126-283 的 draggable/dropTargetForElements 配置提取为共享 hook
- chips/card 复用同一配置，指令只允许 `reorder-before/after`（`allowNesting=false` 时 block make-child）
- 删除 `pinned-pages-section.tsx` 的 `handleChipDragStart/DragOver/Drop/DragEnd`

### 5. 置顶排序持久化 `hooks/use-pinned-reorder.ts`（新增）

从 `PinnedPagesSection` 提取：`reorderPinnedPages` + `invalidateRootSidebarQueries` + `savingRef` 防并发 + 失败回滚。
chips / list / grid 的置顶排序统一走它。

## 四、文件改动清单

| 操作 | 文件 | 说明 |
| --- | --- | --- |
| 新增 | `features/page/tree/components/sidebar-collection.tsx` | 统一容器，三态分发 |
| 新增 | `features/page/tree/components/sidebar-node-card.tsx` | 行外观（list/card/chip） |
| 新增 | `features/page/tree/hooks/use-sidebar-dnd.ts` | 统一拖拽 hook |
| 新增 | `features/page/tree/hooks/use-pinned-reorder.ts` | 置顶排序 + 持久化 |
| 修改 | `features/page/tree/components/space-tree.tsx` | 三分支 if/else 收敛为 `<SidebarCollection>`；数据适配（pinnedRoots 过滤、layout 透传） |
| 修改 | `features/space/components/sidebar/space-sidebar.tsx` | 布局切换按钮去掉 `sidebarView === "all"` 限制；`layout` 值域扩展 chips；localStorage 读写白名单兼容旧值 |
| 修改 | `features/page/tree/components/pinned-pages-section.tsx` | 消除 showHeader 双路径：只保留区块头（折叠/计数/超限提示），内容一律交给 SidebarCollection |
| 修改 | `features/page/tree/components/space-tree-row.tsx` | 变薄为 list 外观壳，内容复用 SidebarNodeCard |
| 删除 | `features/page/tree/components/space-grid-view.tsx` | 被 DocTree + card row 替代 |
| 修改 | `features/page/types/page.types.ts` | `SidebarLayoutMode` 扩展为 list/grid/chips |
| 样式 | `space-grid-view.module.css` / `pinned-pages-section.module.css` | grid/chip 样式并入 `sidebar-node-card.module.css`，原文件精简 |

## 五、行为变化（刻意为之，需产品确认）

1. **网格获得**：拖拽排序、键盘导航、虚拟滚动、右键菜单（能力补齐，非回归）
2. **置顶 tab 可选 list/grid**：布局切换器在所有视图显示；chips 为置顶默认形态
3. **拖拽只剩一套** pragmatic-dnd
4. 右键菜单在 grid/chips 同样出现（NodeMenu 共享）——若产品不想要，SidebarNodeCard 提供开关

## 六、兼容与风险

- **localStorage**：旧值只有 `list|grid`，读取时白名单校验（未知值回退 `list`），安全
- **grid 用 DocTree 引擎**：`openIds` 传空 Set，`flattenVisible` 只输出根节点，与现网格行为一致
- **chips 无虚拟滚动**：数量受 `PINNED_PAGES_LIMIT=10` 约束可接受；若未来放宽限制再补虚拟化
- **排序语义边界**：all 视图"置顶在前"由服务器 pinnedAt 排序维持；**手动置顶排序仅 pinned 视图生效**，避免两种排序源冲突（PinnedPagesSection 现状亦如此）
- **测试**：`tree-model.test.ts`、`build-tree-create-payload.test.ts` 不受影响；建议为 SidebarCollection 补轻量渲染测试

## 七、分步落地（每步可独立合入）

1. 提类型（`SidebarLayoutMode`）+ 提 `usePinnedReorder`（纯重构，无行为变化）
2. 提 `useSidebarDnd` 并替换 chips 的原生 DnD（行为一致）
3. 引入 `SidebarNodeCard`，list 路径先复用（无行为变化）
4. `SidebarCollection` 接入 `space-tree`，grid 改走 DocTree 引擎（网格获得新能力，合入前过产品）
5. 布局切换器放开到所有视图，chips 并入 layout 枚举

每步合入后跑：
```bash
pnpm --filter client test src/features/page/tree/model/tree-model.test.ts src/features/page/tree/hooks/build-tree-create-payload.test.ts
pnpm --filter client build
```
