import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Box,
  Circle,
  Columns3,
  Copy,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  Grid2X2,
  Group,
  Hexagon,
  Import,
  Layers,
  LocateFixed,
  Maximize,
  MousePointer2,
  Move3D,
  Plus,
  Redo2,
  Rotate3D,
  Search,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import {
  Color3,
  PBRMaterial,
  StandardMaterial,
  TransformNode,
  Mesh,
  Quaternion,
} from "@babylonjs/core";
import {
  Editor,
  type Mode,
  type Shape,
  type ViewState,
  getGeometry,
  geometryFields,
} from "./editor";
import "./style.css";

// 数字输入在提交时更新场景，让一次输入只对应一条历史记录。
function NumberField({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  const [text, setText] = useState(String(Number(value.toFixed(3))));
  useEffect(() => setText(String(Number(value.toFixed(3)))), [value]);
  const submit = () => {
    const n = Number(text);
    if (text.trim() && Number.isFinite(n)) onChange(n);
    setText(String(Number(value.toFixed(3))));
  };
  return (
    <label className={`axis axis-${label.toLowerCase()}`}>
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        step="0.1"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}
function App() {
  const canvas = useRef<HTMLCanvasElement>(null),
    editor = useRef<Editor | null>(null),
    importInput = useRef<HTMLInputElement>(null),
    openInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ViewState>({
    nodes: [],
    selected: null,
    undo: false,
    redo: false,
  });
  const [mode, setMode] = useState<Mode>("position"),
    [menu, setMenu] = useState(false),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("准备就绪"),
    [working, setWorking] = useState(false),
    [grid, setGrid] = useState(true),
    [sceneName, setSceneName] = useState("Untitled Scene");
  const [propertyText, setPropertyText] = useState("{}"),
    [propertyError, setPropertyError] = useState(""),
    [propertyDirty, setPropertyDirty] = useState(false);
  const [newScene, setNewScene] = useState(false);
  const selected = state.selected;
  const run = async (action: () => void | Promise<void>, message?: string) => {
    setWorking(true);
    try {
      await action();
      if (message) setStatus(message);
    } catch (e) {
      setStatus(`操作失败：${e instanceof Error ? e.message : e}`);
    } finally {
      setWorking(false);
    }
  };
  useEffect(() => {
    if (!canvas.current) return;
    let instance: Editor;
    try {
      instance = new Editor(canvas.current);
    } catch (e) {
      setStatus(`三维视口初始化失败：${e}`);
      return;
    }
    editor.current = instance;
    instance.onChange = setState;
    instance.emit();
    return () => {
      instance.dispose();
      editor.current = null;
    };
  }, []);
  useEffect(() => {
    setPropertyText(JSON.stringify(selected?.metadata ?? {}, null, 2));
    setPropertyError("");
    setPropertyDirty(false);
  }, [selected, selected?.metadata]);
  const tool = (m: Mode) => {
    editor.current?.setMode(m);
    setMode(m);
  };
  const save = () => {
    const e = editor.current;
    if (!e) return;
    const url = URL.createObjectURL(
      new Blob([e.serialize()], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sceneName.replace(/[\\/:*?"<>|]/g, "_") || "scene"}.babylon`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("场景已导出 · 可直接在 Babylon.js 中加载");
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).closest("input,textarea,select") ||
        working ||
        newScene
      )
        return;
      const e = editor.current;
      if (!e) return;
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (["s", "z", "y", "d", "o"].includes(key)) event.preventDefault();
        if (key === "s") save();
        if (key === "z") void run(() => e.travel(event.shiftKey ? 1 : -1));
        if (key === "y") void run(() => e.travel(1));
        if (key === "d") e.duplicate();
        if (key === "o") openInput.current?.click();
        return;
      }
      if (event.key.toLowerCase() === "w") tool("position");
      if (event.key.toLowerCase() === "e") tool("rotation");
      if (event.key.toLowerCase() === "r") tool("scale");
      if (event.key.toLowerCase() === "f") e.focus();
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        e.remove();
      }
      if (event.key === "Escape") {
        setMenu(false);
        e.select(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  const change = (fn: () => void) => editor.current?.update(fn);
  const shapes: {
    type: Shape;
    name: string;
    icon: typeof Box;
    hint: string;
  }[] = [
    { type: "box", name: "立方体", icon: Box, hint: "BOX" },
    { type: "sphere", name: "球体", icon: Circle, hint: "SPHERE" },
    { type: "cylinder", name: "圆柱体", icon: Columns3, hint: "CYLINDER" },
    { type: "ground", name: "平面", icon: Grid2X2, hint: "PLANE" },
    { type: "group", name: "空分组", icon: Group, hint: "GROUP" },
  ];
  const children = (parent: TransformNode | null, depth = 0): React.ReactNode =>
    state.nodes
      .filter((n) => (n.parent ?? null) === parent)
      .map((node) => {
        const matches =
          !query ||
          node.name.toLowerCase().includes(query.toLowerCase()) ||
          node
            .getDescendants()
            .some((n) => n.name.toLowerCase().includes(query.toLowerCase()));
        if (!matches) return null;
        return (
          <React.Fragment key={node.uniqueId}>
            <div
              className={`tree-row ${node === selected ? "selected" : ""}`}
              style={{ paddingLeft: 16 + depth * 16 }}
              onClick={() => editor.current?.select(node)}
              onDoubleClick={() => {
                editor.current?.select(node);
                editor.current?.focus();
              }}
            >
              <span className="tree-branch">
                {state.nodes.some((n) => n.parent === node) ? "⌄" : "·"}
              </span>
              {node instanceof Mesh ? <Box size={15} /> : <Group size={15} />}
              <span className="node-name">{node.name}</span>
              <button
                title={node.isEnabled(false) ? "隐藏对象" : "显示对象"}
                onClick={(event) => {
                  event.stopPropagation();
                  change(() => node.setEnabled(!node.isEnabled(false)));
                }}
              >
                {node.isEnabled(false) ? (
                  <Eye size={14} />
                ) : (
                  <EyeOff size={14} />
                )}
              </button>
            </div>
            {children(node, depth + 1)}
          </React.Fragment>
        );
      });
  const rotation =
    selected?.rotationQuaternion?.toEulerAngles() ?? selected?.rotation;
  const geometry = getGeometry(selected);
  const material = selected instanceof Mesh ? selected.material : null;
  const color =
    material instanceof StandardMaterial
      ? material.diffuseColor
      : material instanceof PBRMaterial
        ? material.albedoColor
        : null;
  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-icon">
            <Hexagon size={24} />
          </span>
          <div>
            Scene Studio
            <span className="version">STATIC SCENE EDITOR · v0.1</span>
          </div>
        </div>
        <div className="document">
          <span className="document-dot" />
          <input
            aria-label="场景名称"
            value={sceneName}
            onChange={(e) => setSceneName(e.target.value)}
          />
          <span className="file-tag">.babylon</span>
        </div>
        <div className="header-actions">
          <button
            disabled={working}
            onClick={() => setNewScene(true)}
            title="新建场景"
          >
            <FilePlus2 size={16} />
            <span>新建</span>
          </button>
          <button disabled={working} onClick={() => openInput.current?.click()}>
            <FolderOpen size={16} />
            <span>打开</span>
          </button>
          <button className="primary" disabled={working} onClick={save}>
            <Download size={16} />
            保存场景
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="left-panel">
          <div className="panel-heading">
            <span>
              <Layers size={15} />
              场景层级
            </span>
            <button title="添加对象" onClick={() => setMenu(!menu)}>
              <Plus size={18} />
            </button>
          </div>
          <div className="search">
            <Search size={14} />
            <input
              placeholder="搜索对象…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="scene-root">
            <Layers size={15} />
            <span>{sceneName}</span>
            <span className="count">{state.nodes.length}</span>
          </div>
          <div className="tree">
            {children(null)}
            {!state.nodes.length && (
              <div className="empty-tree">
                <Box size={30} />
                <p>从一个对象开始</p>
                <span>添加几何体或导入 GLB 模型</span>
                <button
                  onClick={() => {
                    editor.current?.add("box");
                  }}
                >
                  添加立方体
                </button>
              </div>
            )}
          </div>
          <div className="panel-foot">
            <span>{state.nodes.length} 个对象</span>
            <span>静态场景</span>
          </div>
        </aside>
        <main className="main-panel">
          <div className="toolbar">
            <div className="toolbar-group">
              <div className="add-wrap">
                <button
                  className="add-button"
                  disabled={working}
                  onClick={() => setMenu(!menu)}
                >
                  <Plus size={16} />
                  添加对象<span className="chevron">⌄</span>
                </button>
                {menu && (
                  <>
                    <div
                      className="menu-backdrop"
                      onClick={() => setMenu(false)}
                    />
                    <div className="add-menu">
                      <div className="menu-label">基础对象</div>
                      {shapes.map(({ type, name, icon: Icon, hint }) => (
                        <button
                          key={type}
                          onClick={() => {
                            editor.current?.add(type);
                            setMenu(false);
                          }}
                        >
                          <Icon size={17} />
                          {name}
                          <span>{hint}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button
                disabled={working}
                onClick={() => importInput.current?.click()}
              >
                <Import size={16} />
                导入模型
              </button>
            </div>
            <div className="toolbar-group">
              <button
                title="撤销 Ctrl/⌘ Z"
                disabled={!state.undo || working}
                onClick={() => void run(() => editor.current!.travel(-1))}
              >
                <Undo2 size={17} />
              </button>
              <button
                title="重做 Ctrl/⌘ Shift Z"
                disabled={!state.redo || working}
                onClick={() => void run(() => editor.current!.travel(1))}
              >
                <Redo2 size={17} />
              </button>
              <i />
              <button
                title="复制 Ctrl/⌘ D"
                disabled={!selected || working}
                onClick={() => editor.current?.duplicate()}
              >
                <Copy size={16} />
              </button>
              <button
                title="删除 Delete"
                disabled={!selected || working}
                onClick={() => editor.current?.remove()}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          <div
            className="viewport"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file && !working)
                void run(
                  () =>
                    /\.babylon$/i.test(file.name)
                      ? editor.current!.open(file)
                      : editor.current!.import(file),
                  "文件已加载",
                );
            }}
          >
            <canvas ref={canvas} />
            <div className="viewport-title">
              <span className="live-dot" />
              透视视图<span className="viewport-divider">/</span>
              <span>自由相机</span>
            </div>
            <div className="tools">
              {(
                [
                  { id: "position", icon: Move3D, name: "移动", key: "W" },
                  { id: "rotation", icon: Rotate3D, name: "旋转", key: "E" },
                  { id: "scale", icon: Maximize, name: "缩放", key: "R" },
                ] as const
              ).map(({ id, icon: Icon, name, key }) => (
                <button
                  key={id}
                  className={mode === id ? "active" : ""}
                  title={`${name} (${key})`}
                  onClick={() => tool(id)}
                >
                  <Icon size={19} />
                  <kbd>{key}</kbd>
                </button>
              ))}
              <div className="tool-separator" />
              <button
                title="聚焦对象 (F)"
                onClick={() => editor.current?.focus()}
              >
                <LocateFixed size={19} />
                <kbd>F</kbd>
              </button>
              <button
                title="切换网格"
                className={grid ? "grid-active" : ""}
                onClick={() => {
                  editor.current?.toggleGrid();
                  setGrid(!grid);
                }}
              >
                <Grid2X2 size={19} />
              </button>
            </div>
            <div className="axis-compass">
              <span className="y">Y</span>
              <span className="z">Z</span>
              <span className="x">X</span>
              <span className="axis-center" />
            </div>
            {!state.nodes.length && (
              <div className="viewport-welcome">
                <div className="welcome-icon">
                  <Box size={26} />
                </div>
                <h1>构建你的场景</h1>
                <p>摆放对象，定义结构。让代码赋予它行为。</p>
                <div>
                  <button onClick={() => editor.current?.add("box")}>
                    <Plus size={15} />
                    添加几何体
                  </button>
                  <button onClick={() => importInput.current?.click()}>
                    <Upload size={15} />
                    导入 GLB
                  </button>
                </div>
                <span>也可以将模型拖入视口</span>
              </div>
            )}
            <div className="viewport-bottom">
              <span>
                <MousePointer2 size={13} />
                单击选择 · 拖动环绕 · 滚轮缩放 · 右键平移
              </span>
              <span>1 单位 = 1 米</span>
            </div>
            {working && <div className="busy">正在处理场景…</div>}
          </div>
          <div className="assets-panel">
            <div className="assets-heading">
              <span>
                <Box size={15} />
                基础几何体
              </span>
              <span>点击添加到场景</span>
            </div>
            <div className="asset-list">
              {shapes.map(({ type, name, icon: Icon, hint }) => (
                <button
                  disabled={working}
                  className="asset-card"
                  key={type}
                  onClick={() => editor.current?.add(type)}
                >
                  <span className="asset-icon">
                    <Icon size={26} strokeWidth={1.3} />
                    <span>+</span>
                  </span>
                  <strong>{name}</strong>
                  <small>{hint}</small>
                </button>
              ))}
              <button
                className="asset-card import-card"
                disabled={working}
                onClick={() => importInput.current?.click()}
              >
                <span className="asset-icon">
                  <Upload size={24} strokeWidth={1.3} />
                </span>
                <strong>导入模型</strong>
                <small>.GLB</small>
              </button>
              <div className="asset-note">
                <p>只专注场景本身</p>
                <span>
                  模型、层级与属性保存在场景文件中。
                  <br />
                  游戏逻辑由你的代码实现。
                </span>
              </div>
            </div>
          </div>
        </main>
        <aside className="right-panel">
          <div className="panel-heading">
            <span>
              <Columns3 size={15} />
              对象属性
            </span>
            <span className="tiny-tag">INSPECTOR</span>
          </div>
          {selected ? (
            <div className="inspector" key={selected.uniqueId}>
              <div className="object-heading">
                <span className="object-icon">
                  <Box size={22} />
                </span>
                <div>
                  <input
                    aria-label="对象名称"
                    defaultValue={selected.name}
                    onBlur={(e) =>
                      change(() => {
                        selected.name = e.target.value.trim() || selected.name;
                      })
                    }
                  />
                  <span>{selected.getClassName()}</span>
                </div>
              </div>
              <section>
                <h3>基础信息</h3>
                <label className="field">
                  <span>对象 ID</span>
                  <input readOnly value={selected.id} title={selected.id} />
                </label>
                <label className="field">
                  <span>父对象</span>
                  <select
                    value={selected.parent?.uniqueId ?? ""}
                    onChange={(e) =>
                      change(() => {
                        const parent =
                          state.nodes.find(
                            (n) => n.uniqueId === Number(e.target.value),
                          ) ?? null;
                        selected.setParent(parent);
                      })
                    }
                  >
                    <option value="">场景根节点</option>
                    {state.nodes
                      .filter(
                        (n) => n !== selected && !n.isDescendantOf(selected),
                      )
                      .map((n) => (
                        <option key={n.uniqueId} value={n.uniqueId}>
                          {n.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={selected.isEnabled(false)}
                    onChange={(e) =>
                      change(() => selected.setEnabled(e.target.checked))
                    }
                  />
                  在场景中显示
                </label>
              </section>
              <section>
                <h3>
                  变换 <span>TRANSFORM</span>
                </h3>
                {(["position", "rotation", "scaling"] as const).map(
                  (field, index) => (
                    <div className="transform-field" key={field}>
                      <label>
                        {["位置", "旋转", "缩放"][index]}
                        <span>{index === 1 ? "°" : ""}</span>
                      </label>
                      <div className="axes">
                        {(["x", "y", "z"] as const).map((axis) => (
                          <NumberField
                            key={axis}
                            label={axis.toUpperCase()}
                            value={
                              field === "rotation"
                                ? ((rotation?.[axis] ?? 0) * 180) / Math.PI
                                : selected[field][axis]
                            }
                            onChange={(v) =>
                              change(() => {
                                if (field === "rotation") {
                                  const angles =
                                    selected.rotationQuaternion?.toEulerAngles() ??
                                    selected.rotation.clone();
                                  angles[axis] = (v * Math.PI) / 180;
                                  if (selected.rotationQuaternion)
                                    selected.rotationQuaternion =
                                      Quaternion.FromEulerVector(angles);
                                  else selected.rotation.copyFrom(angles);
                                } else if (
                                  field !== "scaling" ||
                                  Math.abs(v) >= 0.001
                                )
                                  selected[field][axis] = v;
                              })
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ),
                )}
              </section>
              {geometry && (
                <section>
                  <h3>
                    几何体参数 <span>GEOMETRY</span>
                  </h3>
                  {geometryFields[geometry.type].map((field) => (
                    <div className="geometry-field" key={field.key}>
                      <span>{field.name}</span>
                      <NumberField
                        label=""
                        value={geometry.params[field.key]}
                        onChange={(v) =>
                          editor.current?.editGeometry(field.key, v)
                        }
                      />
                    </div>
                  ))}
                </section>
              )}
              {color && (
                <section>
                  <h3>
                    材质 <span>MATERIAL</span>
                  </h3>
                  <label className="field">
                    <span>基础颜色</span>
                    <input
                      type="color"
                      value={color.toHexString()}
                      onChange={(e) =>
                        change(() => {
                          const copy = material!.clone(
                            `${selected.name} material`,
                          );
                          if (!copy) return;
                          if (copy instanceof StandardMaterial)
                            copy.diffuseColor = Color3.FromHexString(
                              e.target.value,
                            );
                          if (copy instanceof PBRMaterial)
                            copy.albedoColor = Color3.FromHexString(
                              e.target.value,
                            );
                          (selected as Mesh).material = copy;
                        })
                      }
                    />
                  </label>
                </section>
              )}
              <section>
                <h3>
                  自定义属性 <span>METADATA</span>
                </h3>
                <p className="section-description">
                  以 JSON 保存，加载后通过对象的 metadata 读取。
                </p>
                <textarea
                  className="metadata"
                  spellCheck={false}
                  value={propertyText}
                  onChange={(e) => {
                    setPropertyText(e.target.value);
                    setPropertyDirty(true);
                    setPropertyError("");
                  }}
                />
                {propertyError && <p className="error">{propertyError}</p>}
                <button
                  className="apply-button"
                  disabled={!propertyDirty}
                  onClick={() => {
                    try {
                      const data = JSON.parse(propertyText);
                      if (
                        !data ||
                        Array.isArray(data) ||
                        typeof data !== "object"
                      )
                        throw new Error("属性必须是 JSON 对象");
                      if (data.editorId !== selected.id)
                        throw new Error(
                          "editorId 是稳定标识，请保持与对象 ID 相同",
                        );
                      if (
                        JSON.stringify(data.editorGeometry) !==
                        JSON.stringify(selected.metadata?.editorGeometry)
                      )
                        throw new Error(
                          "editorGeometry 由几何体参数面板管理，请保留原值",
                        );
                      change(() => {
                        selected.metadata = data;
                      });
                      setPropertyDirty(false);
                      setPropertyError("");
                      setStatus("自定义属性已应用");
                    } catch (e) {
                      setPropertyError(
                        e instanceof Error ? e.message : "JSON 格式错误",
                      );
                    }
                  }}
                >
                  应用属性
                </button>
              </section>
              <button
                className="delete-object"
                onClick={() => editor.current?.remove()}
              >
                <Trash2 size={14} />
                删除对象
              </button>
            </div>
          ) : (
            <div className="empty-inspector">
              <MousePointer2 size={32} strokeWidth={1.2} />
              <h3>选择一个对象</h3>
              <p>
                在视口或场景树中选择对象，
                <br />
                查看并编辑它的属性。
              </p>
              <div>
                <kbd>W</kbd> 移动 <kbd>E</kbd> 旋转 <kbd>R</kbd> 缩放
              </div>
            </div>
          )}
        </aside>
      </div>
      <footer className="statusbar">
        <span className={status.startsWith("操作失败") ? "status-error" : ""}>
          <span className="status-dot" />
          {status}
        </span>
        <span>
          {selected ? `已选择：${selected.name}` : "未选择对象"}
          <i />
          Babylon.js · WebGL
        </span>
      </footer>
      <input
        ref={importInput}
        type="file"
        accept=".glb"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void run(() => editor.current!.import(f), `已导入 ${f.name}`);
          e.target.value = "";
        }}
      />
      <input
        ref={openInput}
        type="file"
        accept=".babylon"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f)
            void run(async () => {
              await editor.current!.open(f);
              setSceneName(f.name.replace(/\.babylon$/i, ""));
            }, "场景已打开");
          e.target.value = "";
        }}
      />
      {newScene && (
        <div className="modal-backdrop">
          <div className="modal">
            <button className="modal-close" onClick={() => setNewScene(false)}>
              <X size={18} />
            </button>
            <FilePlus2 size={28} />
            <h2>新建空白场景？</h2>
            <p>尚未保存的内容将被替换。你也可以先保存当前场景。</p>
            <div>
              <button
                onClick={() => {
                  save();
                  setNewScene(false);
                }}
              >
                保存当前场景
              </button>
              <button
                className="primary"
                onClick={() => {
                  setNewScene(false);
                  void run(async () => {
                    await editor.current!.clear();
                    setSceneName("Untitled Scene");
                  }, "已新建场景，可通过撤销恢复");
                }}
              >
                新建场景
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
