<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api";
import ImportModal from "../components/ImportModal.vue";
import { categoryLabel, formatDate, formatNGN } from "../format";
import type { Transaction } from "../types";

const showImport = ref(false);
const rows = ref<Transaction[]>([]);
const nextCursor = ref<string | null>(null);
const loading = ref(false);
const error = ref("");

const search = ref("");
const direction = ref("");
const category = ref("");
const status = ref("");
const cursorStack = ref<string[]>([]);

async function load(cursor?: string) {
  loading.value = true;
  error.value = "";
  try {
    const result = await api.getTransactions({
      search: search.value || undefined,
      direction: direction.value || undefined,
      category: category.value || undefined,
      status: status.value || undefined,
      limit: "20",
      cursor,
    });
    rows.value = result.data;
    nextCursor.value = result.nextCursor;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

function applyFilters() {
  cursorStack.value = [];
  load();
}

function nextPage() {
  if (nextCursor.value) {
    cursorStack.value.push(nextCursor.value);
    load(nextCursor.value);
  }
}

function prevPage() {
  cursorStack.value.pop();
  load(cursorStack.value[cursorStack.value.length - 1]);
}

function onImported() {
  cursorStack.value = [];
  load();
}

onMounted(() => load());
</script>

<template>
  <div>
    <div class="page-head">
      <h2>Transactions</h2>
      <button @click="showImport = true">Import</button>
    </div>

    <form class="filters" @submit.prevent="applyFilters">
      <input v-model="search" placeholder="Search description or merchant" />
      <select v-model="direction">
        <option value="">All directions</option>
        <option value="CREDIT">Credit</option>
        <option value="DEBIT">Debit</option>
      </select>
      <select v-model="category">
        <option value="">All categories</option>
        <option v-for="c in ['REVENUE','PAYROLL','SOFTWARE','MARKETING','TRAVEL','UTILITIES','RENT','TAX','TRANSFERS','BANKING_FEES','OTHER']" :key="c" :value="c">{{ categoryLabel(c) }}</option>
      </select>
      <select v-model="status">
        <option value="">All statuses</option>
        <option value="PENDING_CATEGORIZATION">Pending</option>
        <option value="CATEGORIZED">Categorised</option>
        <option value="REVIEW_REQUIRED">Needs review</option>
        <option value="REVIEWED">Reviewed</option>
      </select>
      <button type="submit">Apply</button>
    </form>

    <p v-if="error" class="error">{{ error }}</p>

    <table class="table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Description</th>
          <th>Merchant</th>
          <th>Category</th>
          <th>Direction</th>
          <th class="num">Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in rows" :key="t.id">
          <td>{{ formatDate(t.date) }}</td>
          <td>{{ t.description }}</td>
          <td>{{ t.merchant ?? "" }}</td>
          <td>{{ t.category ? categoryLabel(t.category) : "Uncategorised" }}</td>
          <td>{{ t.direction }}</td>
          <td class="num">{{ formatNGN(t.amount) }}</td>
          <td>{{ t.status }}</td>
        </tr>
        <tr v-if="rows.length === 0 && !loading">
          <td colspan="7" class="muted">No transactions match.</td>
        </tr>
      </tbody>
    </table>

    <div class="pager">
      <button :disabled="cursorStack.length === 0" @click="prevPage">Previous</button>
      <button :disabled="!nextCursor" @click="nextPage">Next</button>
      <span v-if="loading" class="muted">Loading...</span>
    </div>

    <ImportModal v-if="showImport" @imported="onImported" @close="showImport = false" />
  </div>
</template>
