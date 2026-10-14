<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api";
import { categoryLabel, formatDate, formatNGN } from "../format";
import type { Category, TransactionDetail } from "../types";

const items = ref<TransactionDetail[]>([]);
const categories = ref<Category[]>([]);
const error = ref("");

async function load() {
  error.value = "";
  try {
    const [review, cats] = await Promise.all([api.getReview(), api.getCategories()]);
    items.value = review.data;
    categories.value = cats;
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function correct(item: TransactionDetail) {
  if (!item.category) return;
  await api.correctCategory(item.id, item.category);
  await load();
}

async function resolve(item: TransactionDetail, action: "resolve" | "dismiss") {
  await api.resolveReview(item.id, action);
  await load();
}

onMounted(load);
</script>

<template>
  <div>
    <h2>Review</h2>
    <p class="muted">Transactions flagged as needing human attention.</p>
    <p v-if="error" class="error">{{ error }}</p>

    <p v-if="items.length === 0" class="muted">Nothing to review.</p>

    <div v-for="item in items" :key="item.id" class="review-card">
      <div class="review-head">
        <div>
          <strong>{{ item.description }}</strong>
          <span class="muted">{{ item.merchant ? ` · ${item.merchant}` : "" }}</span>
        </div>
        <span class="review-amount">{{ formatNGN(item.amount) }}</span>
      </div>

      <div class="review-meta">
        <span>{{ formatDate(item.date) }}</span>
        <span>{{ item.direction }}</span>
        <span>Category: {{ item.category ? categoryLabel(item.category) : "None" }}</span>
        <span v-if="item.confidence !== null">Confidence: {{ item.confidence.toFixed(2) }}</span>
      </div>

      <ul class="flags">
        <li v-for="f in item.flags" :key="f.id" :class="`flag flag-${f.severity.toLowerCase()}`">
          <strong>{{ f.type }}</strong>: {{ f.explanation }}
        </li>
      </ul>

      <div class="review-actions">
        <select v-model="item.category">
          <option v-for="c in categories" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
        <button @click="correct(item)">Save category</button>
        <button class="ghost" @click="resolve(item, 'dismiss')">Dismiss</button>
        <button class="primary" @click="resolve(item, 'resolve')">Resolve</button>
      </div>
    </div>
  </div>
</template>
