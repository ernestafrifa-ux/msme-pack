import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // During local development (npm run dev), forward API calls to the
      // backend server running separately on port 3000, so the front-end
      // dev server and the API can run side by side without CORS hassle.
      "/api": "http://localhost:3000",
    },
  },
});
