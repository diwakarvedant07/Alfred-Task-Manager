import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Without this, `next start` (production mode) rejects every
  // /api/auth/* request with UntrustedHost -- next-auth v5 only trusts the
  // request's Host header automatically in dev. This app has no real
  // production deployment (self-hosted/local only, same dev-mode-only
  // posture as the password-reset flow), so trusting the host here is safe;
  // `next dev` never hit this because it doesn't enforce the check.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    // Without this, `auth` used as middleware only refreshes the session
    // cookie and lets every request through — see next-auth's handleAuth(),
    // which defaults `authorized` to `true` when this callback is absent.
    // middleware.ts's matcher only covers /canvas and /recycle-bin, so this
    // gates those routes and redirects unauthenticated requests to /login.
    authorized: ({ auth: session }) => !!session?.user,
    // `authorize()` below only returns { id, email, name }. By default that
    // id lands in token.sub but is never copied onto session.user, so every
    // later task's `(await auth()).user.id` would come back undefined. Copy
    // it through explicitly: jwt() runs at sign-in with `user` present,
    // session() runs on every session read and only has the token.
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = (credentials?.email as string | undefined)?.trim().toLowerCase();
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await db.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});
