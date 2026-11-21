import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
const isUserSite = repo && repo.endsWith(".github.io");
const base = process.env.GITHUB_ACTIONS && repo && !isUserSite ? `/${repo}/` : "/";

export default defineConfig({ plugins: [react()], base });
