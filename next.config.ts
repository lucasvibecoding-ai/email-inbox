import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The AI knowledge base (src/lib/knowledge/*.md) is read at runtime with a
  // dynamic path, so Next cannot trace it automatically. Force-include it in
  // the serverless bundle for the routes that run triage.
  outputFileTracingIncludes: {
    '/api/webhook/inbound': ['./src/lib/knowledge/**/*'],
    '/api/triage/sweep': ['./src/lib/knowledge/**/*'],
  },
};

export default nextConfig;
