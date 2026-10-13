import type { preHandlerHookHandler } from "fastify";
import type { Role } from "../../generated/prisma/enums";

export interface AuthUser {
  /** User id (JWT `sub`). */
  sub: string;
  organizationId: string;
  role: Role;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

export const requireAuth: preHandlerHookHandler = async (request) => {
  await request.jwtVerify();
};
