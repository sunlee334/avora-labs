import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("hashPassword", () => {
  it("produces a scrypt$N$r$p$salt$hash formatted string", async () => {
    const hash = await hashPassword("correct horse battery staple");
    const parts = hash.split("$");
    expect(parts).toHaveLength(6);
    const [algo, N, r, p, salt, derived] = parts;
    expect(algo).toBe("scrypt");
    expect(Number(N)).toBeGreaterThan(0);
    expect(Number(r)).toBeGreaterThan(0);
    expect(Number(p)).toBeGreaterThan(0);
    expect(salt).toMatch(/^[0-9a-f]+$/);
    expect(derived).toMatch(/^[0-9a-f]+$/);
  });

  it("uses a different salt (and thus a different hash) each time for the same password", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    const saltA = a.split("$")[4];
    const saltB = b.split("$")[4];
    expect(saltA).not.toBe(saltB);
  });
});

describe("verifyPassword", () => {
  it("returns true for the correct password", async () => {
    const hash = await hashPassword("my-secret-password");
    await expect(verifyPassword("my-secret-password", hash)).resolves.toBe(true);
  });

  it("returns false for an incorrect password", async () => {
    const hash = await hashPassword("my-secret-password");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("returns false when the stored hash has been tampered with", async () => {
    const hash = await hashPassword("my-secret-password");
    const parts = hash.split("$");
    // flip a character in the derived hash hex
    const tamperedHex = parts[5][0] === "0" ? "f" + parts[5].slice(1) : "0" + parts[5].slice(1);
    const tampered = [...parts.slice(0, 5), tamperedHex].join("$");
    await expect(verifyPassword("my-secret-password", tampered)).resolves.toBe(false);
  });

  it("returns false for a malformed stored hash", async () => {
    await expect(verifyPassword("anything", "not-a-valid-hash")).resolves.toBe(false);
    await expect(verifyPassword("anything", "scrypt$1$2$3$onlyfourparts")).resolves.toBe(false);
    await expect(verifyPassword("anything", "bcrypt$1$2$3$salt$hash")).resolves.toBe(false);
  });
});
