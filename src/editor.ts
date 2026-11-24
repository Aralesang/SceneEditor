import {
  AbstractMesh,
  ArcRotateCamera,
  Color3,
  Color4,
  Engine,
  GizmoManager,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Node,
  PBRMaterial,
  PointerEventTypes,
  Scene,
  SceneLoader,
  SceneSerializer,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VertexData,
} from "@babylonjs/core";
import "@babylonjs/loaders";

export type Mode = "position" | "rotation" | "scale";
export type Shape = "box" | "sphere" | "cylinder" | "ground" | "group";
export type EditorNode = TransformNode;
export interface GeometryDefinition {
  type: Exclude<Shape, "group">;
  params: Record<string, number>;
}
export const geometryFields: Record<
  GeometryDefinition["type"],
  { key: string; name: string; initial: number; integer?: boolean }[]
> = {
  box: [
    { key: "width", name: "宽度", initial: 1.5 },
    { key: "height", name: "高度", initial: 1.5 },
    { key: "depth", name: "深度", initial: 1.5 },
  ],
  sphere: [
    { key: "diameter", name: "直径", initial: 1.5 },
    { key: "segments", name: "细分", initial: 32, integer: true },
  ],
  cylinder: [
    { key: "height", name: "高度", initial: 2 },
    { key: "diameterTop", name: "顶部直径", initial: 1.2 },
    { key: "diameterBottom", name: "底部直径", initial: 1.2 },
    { key: "tessellation", name: "细分", initial: 32, integer: true },
  ],
  ground: [
    { key: "width", name: "宽度", initial: 6 },
    { key: "height", name: "长度", initial: 6 },
  ],
};
// 参数也随 metadata 保存；重新打开后仍可继续修改基础几何体。
export function getGeometry(
  node: EditorNode | null,
): GeometryDefinition | null {
  const value = node?.metadata?.editorGeometry;
  if (
    !value ||
    !Object.hasOwn(geometryFields, value.type) ||
    !value.params ||
    typeof value.params !== "object"
  )
    return null;
  return geometryFields[value.type as GeometryDefinition["type"]].every(
    (f) => Number.isFinite(value.params[f.key]) && value.params[f.key] > 0,
  )
    ? value
    : null;
}
export interface ViewState {
  nodes: EditorNode[];
  selected: EditorNode | null;
  undo: boolean;
  redo: boolean;
}

// 编辑辅助统一排除序列化，场景文件只保存用户内容。
export class Editor {
  engine: Engine;
  scene!: Scene;
  camera!: ArcRotateCamera;
  gizmos!: GizmoManager;
  selected: EditorNode | null = null;
  mode: Mode = "position";
  gridVisible = true;
  busy = false;
  private history: string[] = [];
  private cursor = -1;
  private resize: ResizeObserver;
  onChange: (state: ViewState) => void = () => {};
  constructor(public canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    Texture.ForceSerializeBuffers = true;
    this.setup(new Scene(this.engine));
    this.commit();
    this.engine.runRenderLoop(() => this.scene.render());
    this.resize = new ResizeObserver(() => this.engine.resize());
    this.resize.observe(canvas);
  }
  // 加载或撤销后重建编辑相机和网格，不使用场景中的业务相机。
  private setup(scene: Scene) {
    this.scene = scene;
    scene.clearColor = new Color4(0.075, 0.088, 0.108, 1);
    this.camera = new ArcRotateCamera(
      "__editor_camera",
      -Math.PI / 3,
      Math.PI / 3,
      12,
      new Vector3(0, 1, 0),
      scene,
    );
    this.camera.doNotSerialize = true;
    this.camera.minZ = 0.01;
    this.camera.wheelDeltaPercentage = 0.015;
    this.camera.panningSensibility = 70;
    this.camera.attachControl(this.canvas, true);
    this.camera.inputs.attached.keyboard?.detachControl();
    scene.activeCamera = this.camera;
    if (!scene.lights.length)
      new HemisphericLight(
        "Environment light",
        new Vector3(0.5, 1, 0.3),
        scene,
      ).intensity = 1.3;
    const lines: Vector3[][] = [];
    for (let i = -20; i <= 20; i++)
      lines.push(
        [new Vector3(i, 0, -20), new Vector3(i, 0, 20)],
        [new Vector3(-20, 0, i), new Vector3(20, 0, i)],
      );
    const grid = MeshBuilder.CreateLineSystem(
      "__editor_grid",
      { lines },
      scene,
    );
    grid.color = new Color3(0.19, 0.22, 0.27);
    grid.isPickable = false;
    grid.doNotSerialize = true;
    grid.setEnabled(this.gridVisible);
    this.gizmos = new GizmoManager(scene);
    this.gizmos.usePointerToAttachGizmos = false;
    this.setMode(this.mode);
    // 拖动整次结束后才记录历史，避免每帧产生一次撤销。
    for (const gizmo of [
      this.gizmos.gizmos.positionGizmo,
      this.gizmos.gizmos.rotationGizmo,
      this.gizmos.gizmos.scaleGizmo,
    ])
      gizmo?.onDragEndObservable.add(() => {
        this.commit();
      });
    scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERTAP || info.event.button !== 0)
        return;
      const mesh = info.pickInfo?.pickedMesh;
      this.select(mesh && !mesh.doNotSerialize ? mesh : null);
    });
    this.selected = null;
    for (const node of this.nodes())
      node.metadata = { ...(node.metadata ?? {}), editorId: node.id };
  }
  nodes() {
    return [...this.scene.transformNodes, ...this.scene.meshes].filter(
      (n) => !n.doNotSerialize,
    ) as EditorNode[];
  }
  emit() {
    this.onChange({
      nodes: this.nodes(),
      selected: this.selected,
      undo: this.cursor > 0,
      redo: this.cursor < this.history.length - 1,
    });
  }
  select(node: EditorNode | null) {
    this.selected = node;
    this.gizmos.attachToNode(node);
    this.emit();
  }
  setMode(mode: Mode) {
    this.mode = mode;
    this.gizmos.positionGizmoEnabled = true;
    this.gizmos.rotationGizmoEnabled = true;
    this.gizmos.scaleGizmoEnabled = true;
    this.gizmos.positionGizmoEnabled = mode === "position";
    this.gizmos.rotationGizmoEnabled = mode === "rotation";
    this.gizmos.scaleGizmoEnabled = mode === "scale";
  }
  private identify(node: Node) {
    node.id = crypto.randomUUID();
    node.metadata = { ...(node.metadata ?? {}), editorId: node.id };
  }
  add(shape: Shape) {
    const names = {
      box: "立方体",
      sphere: "球体",
      cylinder: "圆柱体",
      ground: "平面",
      group: "分组",
    };
    const name = `${names[shape]} ${this.nodes().filter((n) => n.name.startsWith(names[shape])).length + 1}`;
    const node =
      shape === "group"
        ? new TransformNode(name, this.scene)
        : shape === "box"
          ? MeshBuilder.CreateBox(name, { size: 1.5 }, this.scene)
          : shape === "sphere"
            ? MeshBuilder.CreateSphere(
                name,
                { diameter: 1.5, segments: 32 },
                this.scene,
              )
            : shape === "cylinder"
              ? MeshBuilder.CreateCylinder(
                  name,
                  { height: 2, diameter: 1.2, tessellation: 32 },
                  this.scene,
                )
              : MeshBuilder.CreateGround(
                  name,
                  { width: 6, height: 6 },
                  this.scene,
                );
    this.identify(node);
    if (node instanceof Mesh) {
      const mat = new StandardMaterial(`${name} material`, this.scene);
      mat.diffuseColor = Color3.FromHexString("#8aa8cb");
      mat.specularColor = new Color3(0.15, 0.15, 0.15);
      node.material = mat;
      node.position.y =
        shape === "ground" ? 0.005 : shape === "cylinder" ? 1 : 0.75;
    }
    if (shape !== "group")
      node.metadata.editorGeometry = {
        type: shape,
        params: Object.fromEntries(
          geometryFields[shape].map((f) => [f.key, f.initial]),
        ),
      };
    this.select(node);
    this.commit();
  }
  // 更新网格顶点并保留 ID、材质及变换，副本几何体先解除共享。
  editGeometry(key: string, value: number) {
    const node = this.selected;
    const definition = getGeometry(node);
    if (!(node instanceof Mesh) || !definition) return;
    const field = geometryFields[definition.type].find((f) => f.key === key);
    if (!field || !Number.isFinite(value) || value <= 0) return;
    const params = {
      ...definition.params,
      [key]: field.integer
        ? Math.max(3, Math.min(128, Math.round(value)))
        : Math.max(0.001, Math.min(10000, value)),
    };
    const vertices =
      definition.type === "box"
        ? VertexData.CreateBox(params)
        : definition.type === "sphere"
          ? VertexData.CreateSphere(params)
          : definition.type === "cylinder"
            ? VertexData.CreateCylinder(params)
            : VertexData.CreateGround({ ...params, subdivisions: 1 } as {
                width: number;
                height: number;
                subdivisions: number;
              });
    node.makeGeometryUnique();
    vertices.applyToMesh(node);
    node.refreshBoundingInfo();
    node.metadata = {
      ...node.metadata,
      editorGeometry: { type: definition.type, params },
    };
    this.commit();
  }
  update(action: () => void) {
    action();
    this.commit();
  }
  remove() {
    if (!this.selected) return;
    this.gizmos.attachToNode(null);
    this.selected.dispose(false);
    this.selected = null;
    this.commit();
  }
  duplicate() {
    if (!this.selected) return;
    const clone = this.selected.clone(
      `${this.selected.name} 副本`,
      this.selected.parent,
    );
    if (!clone) return;
    for (const node of [clone, ...clone.getDescendants()]) {
      this.identify(node);
      node.metadata = JSON.parse(JSON.stringify(node.metadata));
    }
    clone.position.x += 1;
    this.select(clone);
    this.commit();
  }
  focus() {
    if (!this.selected) {
      this.camera.setTarget(new Vector3(0, 1, 0));
      this.camera.radius = 12;
      return;
    }
    this.selected.computeWorldMatrix(true);
    const meshes = [this.selected, ...this.selected.getDescendants()].filter(
      (n) => n instanceof AbstractMesh && n.getTotalVertices() > 0,
    ) as AbstractMesh[];
    if (meshes.length) {
      let min = new Vector3(Infinity, Infinity, Infinity),
        max = min.negate();
      for (const mesh of meshes) {
        mesh.computeWorldMatrix(true);
        const box = mesh.getBoundingInfo().boundingBox;
        min = Vector3.Minimize(min, box.minimumWorld);
        max = Vector3.Maximize(max, box.maximumWorld);
      }
      this.camera.setTarget(min.add(max).scale(0.5));
      this.camera.radius = Math.max(2, Vector3.Distance(min, max) * 1.6);
    } else this.camera.setTarget(this.selected.getAbsolutePosition());
  }
  toggleGrid() {
    this.gridVisible = !this.gridVisible;
    this.scene.getMeshByName("__editor_grid")?.setEnabled(this.gridVisible);
  }
  serialize() {
    return JSON.stringify(SceneSerializer.Serialize(this.scene));
  }
  commit() {
    const data = this.serialize();
    if (this.history[this.cursor] !== data) {
      this.history = this.history.slice(0, this.cursor + 1);
      this.history.push(data);
      if (this.history.length > 40) this.history.shift();
      this.cursor = this.history.length - 1;
    }
    this.emit();
  }
  // 在临时场景中完成解析，失败时保留用户当前编辑内容。
  private async replace(data: string) {
    const next = new Scene(this.engine);
    try {
      await SceneLoader.AppendAsync(
        "",
        `data:${data}`,
        next,
        undefined,
        ".babylon",
      );
      await next.whenReadyAsync();
      await this.scene.whenReadyAsync();
    } catch (error) {
      next.dispose();
      throw error;
    }
    this.gizmos.dispose();
    this.scene.dispose();
    this.setup(next);
  }
  async travel(delta: number) {
    const target = this.cursor + delta;
    if (this.busy || target < 0 || target >= this.history.length) return;
    this.busy = true;
    try {
      await this.replace(this.history[target]);
      this.cursor = target;
      this.emit();
    } finally {
      this.busy = false;
    }
  }
  async open(file: File) {
    const data = await file.text();
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed.meshes))
      throw new Error("请选择有效的 .babylon 场景文件");
    await this.replace(data);
    this.commit();
  }
  async import(file: File) {
    if (!/\.glb$/i.test(file.name))
      throw new Error("第一版支持自包含 GLB 模型，请先将模型导出为 .glb");
    const container = await SceneLoader.LoadAssetContainerAsync(
      "",
      file,
      this.scene,
      undefined,
      ".glb",
    );
    container.animationGroups.forEach((a) => a.stop());
    container.addAllToScene();
    await this.scene.whenReadyAsync();
    const root = new TransformNode(
      file.name.replace(/\.glb$/i, ""),
      this.scene,
    );
    this.identify(root);
    for (const node of [...container.transformNodes, ...container.meshes]) {
      this.identify(node);
      if (!node.parent) node.parent = root;
    }
    this.select(root);
    this.focus();
    this.commit();
  }
  async clear() {
    await this.replace('{"meshes":[],"materials":[],"transformNodes":[]}');
    this.commit();
  }
  dispose() {
    this.resize.disconnect();
    this.gizmos.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
