import { ref } from "vue";
import type { User } from "./types";

const storedToken = localStorage.getItem("token");
const storedUser = localStorage.getItem("user");

const token = ref<string | null>(storedToken);
const user = ref<User | null>(storedUser ? (JSON.parse(storedUser) as User) : null);

export function useAuth() {
  function setSession(newToken: string, newUser: User) {
    token.value = newToken;
    user.value = newUser;
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }

  return { token, user, setSession, logout };
}
