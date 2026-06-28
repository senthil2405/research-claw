import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/server/db";
import { ALLOW_DEV_LOGIN, DEV_USER } from "@/lib/constants";

// Make `session.user.id` typecheck everywhere `auth()`/`useSession()` is used.
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

// Add `uid` to the JWT payload type. The JWT interface is declared in
// @auth/core/jwt (next-auth/jwt only re-exports it), so augment it there.
declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
  }
}

const googleId = process.env.AUTH_GOOGLE_ID;
const googleSecret = process.env.AUTH_GOOGLE_SECRET;

// Build the providers array conditionally so the app boots with empty creds.
const providers: NextAuthConfig["providers"] = [];

if (googleId && googleSecret) {
  providers.push(
    Google({
      clientId: googleId,
      clientSecret: googleSecret,
      // Link a Google account to an existing user with the same email.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (ALLOW_DEV_LOGIN) {
  providers.push(
    Credentials({
      id: "dev",
      name: "dev",
      // No credential fields — a single click signs in as the fixed dev user.
      credentials: {},
      async authorize() {
        // Ensure the FK target exists for Document.userId.
        const user = await prisma.user.upsert({
          where: { id: DEV_USER.id },
          create: {
            id: DEV_USER.id,
            name: DEV_USER.name,
            email: DEV_USER.email,
            image: DEV_USER.image,
          },
          update: {
            name: DEV_USER.name,
            email: DEV_USER.email,
            image: DEV_USER.image,
          },
        });
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Credentials provider is incompatible with database sessions, so use JWT.
  session: { strategy: "jwt" },
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers,
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) {
        session.user.id = token.uid;
      }
      return session;
    },
  },
});
