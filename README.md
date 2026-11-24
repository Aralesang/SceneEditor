# Scene Studio

本地浏览器版静态 3D 场景编辑器。使用 React、TypeScript、Vite 和 Babylon.js，无游戏运行模式、脚本系统或后端。

## 启动

```bash
npm install
npm run dev
```

浏览器打开终端打印的地址。生产构建：`npm run build`，预览构建：`npm run preview`。

## 第一版功能

- 基础几何体：立方体、球体、圆柱、平面；可继续调整尺寸和细分参数。
- 自包含 GLB 模型导入，也支持拖入视口；暂不支持依赖外部贴图的多文件 glTF。
- 场景树、分组、父对象编辑、显示和隐藏。
- Gizmo 与数值变换编辑、复制、删除、聚焦。
- 基础材质颜色编辑，自定义 JSON metadata。
- 40 个场景快照的撤销重做（大模型会增加内存与保存耗时）。
- 导出 `.babylon`，重新打开后继续编辑。编辑相机、网格和 Gizmo 不会导出。

快捷键：W 移动、E 旋转、R 缩放、F 聚焦；Delete 删除；Ctrl/⌘ D 复制；Ctrl/⌘ Z 撤销；Ctrl/⌘ Shift Z 重做；Ctrl/⌘ S 保存；Ctrl/⌘ O 打开。鼠标拖动环绕、右键拖动平移、滚轮缩放。

数据保存在下载的文件中，没有自动保存。打开场景会替换当前内容，可以撤销；刷新或关闭页面前请保存。自定义属性文本必须点击“应用属性”才会写入场景。

## 在 Babylon.js 游戏项目中使用

```ts
import { SceneLoader } from "@babylonjs/core";
import "@babylonjs/core/Loading/Plugins/babylonFileLoader";

// scene 和游戏相机由游戏代码创建；编辑器不会导出编辑相机。
await SceneLoader.AppendAsync("/scenes/", "level.babylon", scene);

// 对象名可以修改或重复，业务引用优先使用编辑器属性栏显示的稳定 ID。
const door = scene.getNodeById("从编辑器复制的对象ID");
if (door?.metadata?.interactionType === "door") {
  const locked = door.metadata.locked;
  // 在此添加游戏自己的行为。
}
```

几何体和导入模型的每个对象均有稳定 `id`，同时写入 `metadata.editorId`。复制对象会生成新 ID；改名、保存、重新加载会保留原 ID。`metadata.editorGeometry` 是基础几何体参数，供编辑器重新打开后继续修改；业务属性直接添加在 metadata 中，保留 editorId 和 editorGeometry 即可。

模型导入限制为 GLB。保存时纹理会尝试内嵌至场景文件，文件可能显著增大。第一版不提供顶点/边/面编辑、布尔建模、动画编辑、贴图管理、灯光属性面板或多选；复杂模型建议在建模工具完成后导入。

## 源码

- `src/editor.ts`：Babylon 生命周期、场景操作、历史记录、保存和加载。
- `src/main.tsx`：编辑器布局、场景树、属性表单和快捷键。
- `src/style.css`：编辑器样式。
