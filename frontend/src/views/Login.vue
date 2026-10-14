<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { useAuth } from "../auth";

const email = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);

const router = useRouter();
const { setSession } = useAuth();

async function submit() {
  error.value = "";
  loading.value = true;
  try {
    const result = await api.login(email.value, password.value);
    setSession(result.token, result.user);
    router.push("/");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login">
    <h1>Transaction Intelligence</h1>
    <p class="hint">Seed users: admin@acme.ng or admin@globex.ng (password: password123)</p>
    <form @submit.prevent="submit">
      <label>
        Email
        <input v-model="email" type="email" autocomplete="username" required />
      </label>
      <label>
        Password
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>
      <button type="submit" :disabled="loading">{{ loading ? "Signing in..." : "Sign in" }}</button>
      <p v-if="error" class="error">{{ error }}</p>
    </form>
  </div>
</template>
