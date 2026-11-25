import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";

// Tanpa database online: username & password Admin dibaca dari secret
// ADMIN_USERNAME / ADMIN_PASSWORD dan dicek di server. Setelah
// berhasil, server menyimpan status login di cookie terenkripsi.

type AdminSession = { admin?: boolean };

const same = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a, "utf8").digest(), createHash("sha256").update(b, "utf8").digest());

/** Kunci enkripsi cookie, disimpan sebagai secret SESSION_SECRET (min. 32 karakter). */
function sessionSecret() {
  const fromEnv = process.env["SESSION_SECRET"];
  if (!fromEnv || fromEnv.length < 32) throw new Error("SESSION_SECRET belum dikonfigurasi (min. 32 karakter).");
  return fromEnv;
}

function adminSession() {
  return useSession<AdminSession>({
    password: sessionSecret(),
    name: "covid-admin",
    maxAge: 60 * 60 * 12, // 12 jam
    // SameSite=None + Secure so the login also works when the app is embedded (editor preview).
    cookie: { httpOnly: true, sameSite: "none", secure: true, path: "/" },
  });
}

export const verifyAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const U = process.env["ADMIN_USERNAME"];
    const P = process.env["ADMIN_PASSWORD"];
    if (!U || !P) return { ok: false as const, error: "Akun admin belum dikonfigurasi. Isi secret ADMIN_USERNAME dan ADMIN_PASSWORD." };
    const okUser = same(data.username.toLowerCase(), U.trim().toLowerCase());
    const okPass = same(data.password, P);
    if (!(okUser && okPass)) return { ok: false as const, error: "Username atau password salah." };
    const session = await adminSession();
    await session.update({ admin: true });
    return { ok: true as const };
  });

export const getAdminStatus = createServerFn({ method: "GET" }).handler(async () => {
  const session = await adminSession();
  return { admin: session.data.admin === true };
});

export const logoutAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const session = await adminSession();
  await session.clear();
  return { ok: true as const };
});
