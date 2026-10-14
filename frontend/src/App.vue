<script setup lang="ts">
import { useRouter } from "vue-router";
import { useAuth } from "./auth";

const { user, logout } = useAuth();
const router = useRouter();

function signOut() {
  logout();
  router.push("/login");
}
</script>

<template>
  <div v-if="user" class="app">
    <header class="topbar">
      <span class="brand">Sycamore</span>
      <nav>
        <router-link to="/">Dashboard</router-link>
        <router-link to="/transactions">Transactions</router-link>
        <router-link to="/review">Review</router-link>
      </nav>
      <div class="account">
        <span>{{ user.email }}</span>
        <button @click="signOut">Log out</button>
      </div>
    </header>
    <main class="content">
      <router-view />
    </main>
  </div>
  <router-view v-else />
</template>
