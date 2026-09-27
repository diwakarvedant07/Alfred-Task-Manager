// URL prefix the app is served under, e.g. "/ALFRED" behind an nginx
// `location /ALFRED` proxy. Empty string = served at the domain root.
// NEXT_PUBLIC_ so it is inlined into client bundles; like next.config's
// basePath it is read at build time, so changing it requires a rebuild.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
