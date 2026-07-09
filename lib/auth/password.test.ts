import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("round-trips a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(
      verifyPassword("correct horse battery staple", hash),
    ).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const hashA = await hashPassword("same-input");
    const hashB = await hashPassword("same-input");
    expect(hashA).not.toBe(hashB);
  });

  it("never stores the plaintext password in the hash", async () => {
    const hash = await hashPassword("super-secret-password");
    expect(hash).not.toContain("super-secret-password");
  });
});
