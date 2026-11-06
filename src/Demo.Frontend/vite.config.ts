import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendApiUrl = env.VITE_BACKEND_API_URL || "";
  const backendProxyUrl = env.VITE_BACKEND_PROXY_URL || env.VITE_BACKEND_API_URL || "http://localhost:21210";

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 4173,
      proxy: {
        "/db": backendProxyUrl,
        "/metadata": {
          target: backendProxyUrl,
          bypass: (req) => req.headers.accept?.includes("text/html") ? "/index.html" : undefined,
        },
        "/dynamic-query": backendProxyUrl,
        "/oquery": backendProxyUrl,
        "^/report(?:/|$)": backendProxyUrl,
        "^/query-request(?:/|$)": backendProxyUrl,
      },
    },
  };
});
