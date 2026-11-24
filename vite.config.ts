import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 编辑器在本机运行，开发时启用 React 快速刷新。
export default defineConfig({ plugins: [react()] });
