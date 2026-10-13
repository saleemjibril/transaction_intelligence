import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { z } from "zod";
import { authenticate } from "./service";

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/auth/login",
    { schema: { body: loginBodySchema } },
    async (request) => {
      const { email, password } = request.body;
      const user = await authenticate(app.db, email, password);

      const token = app.jwt.sign(
        { sub: user.id, organizationId: user.organizationId, role: user.role },
        { expiresIn: "8h" },
      );

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          organizationId: user.organizationId,
          role: user.role,
        },
      };
    },
  );
};
