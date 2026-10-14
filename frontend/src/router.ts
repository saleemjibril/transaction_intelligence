import { createRouter, createWebHistory } from "vue-router";
import Dashboard from "./views/Dashboard.vue";
import Login from "./views/Login.vue";
import Review from "./views/Review.vue";
import Transactions from "./views/Transactions.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: Login },
    { path: "/", component: Dashboard },
    { path: "/transactions", component: Transactions },
    { path: "/review", component: Review },
  ],
});

router.beforeEach((to) => {
  const authenticated = Boolean(localStorage.getItem("token"));
  if (!authenticated && to.path !== "/login") {
    return "/login";
  }
  if (authenticated && to.path === "/login") {
    return "/";
  }
});
