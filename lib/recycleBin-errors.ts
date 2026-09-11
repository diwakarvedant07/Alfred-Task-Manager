// Thrown by restoreTask (app/actions/recycleBin.ts) when restoring it
// independently would leave it ACTIVE while its own primaryThread is still
// DELETED — the exact state deleteThread's cascade (see
// app/actions/threads.ts) exists to prevent.
//
// Lives outside app/actions/recycleBin.ts because that file has "use
// server" at the top, and Next.js only allows async function exports from
// a "use server" file — a plain class export breaks the production build.
// Same constraint, same fix as SignupError / lib/auth-errors.ts.
export class RestoreBlockedError extends Error {}
