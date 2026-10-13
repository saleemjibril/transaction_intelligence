import type { Db } from "../../db";
import { AppError } from "../../lib/errors";
import { verifyPassword } from "../../lib/password";

export async function authenticate(db: Db, email: string, password: string) {
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }
  return user;
}
