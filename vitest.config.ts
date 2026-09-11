import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "paros-db-driver": path.resolve(__dirname, "./src/db/driver.node.ts"),
      "paros-upload-driver": path.resolve(__dirname, "./src/lib/upload-driver.node.ts"),
      // server-only 는 RSC 밖에서 import 하면 throw 한다. 서버 모듈(checkout·coupons 등)을 테스트하기 위해 빈 모듈로 대체.
      "server-only": path.resolve(__dirname, "./tests/helpers/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    env: {
      DATABASE_URL: ":memory:",
      ADMIN_PASSWORD: "test-admin-password-1234",
      TOSS_SECRET_KEY: "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6",
      UPLOAD_DIR: "./data/test-uploads",
    },
  },
});
