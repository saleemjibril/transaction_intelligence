<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api";
import type { Account, BatchResult } from "../types";

const emit = defineEmits<{ (e: "imported"): void; (e: "close"): void }>();

const mode = ref<"batch" | "single">("batch");
const accounts = ref<Account[]>([]);
const loading = ref(false);
const error = ref("");
const result = ref<BatchResult | null>(null);

const single = ref({
  externalRef: "",
  accountId: "",
  amount: "",
  direction: "DEBIT" as "CREDIT" | "DEBIT",
  description: "",
  merchant: "",
  date: todayAt(),
});

const batchText = ref("");

function todayAt(hour = 9): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function loadSample() {
  const ref = Date.now();
  const accountId = accounts.value[0]?.id ?? "";
  const date = todayAt();
  batchText.value = JSON.stringify(
    [
      { externalRef: `SAMPLE-${ref}-1`, accountId, amount: "1850000.00", direction: "DEBIT", description: "Monthly staff payroll", merchant: "Access Bank", date },
      { externalRef: `SAMPLE-${ref}-2`, accountId, amount: "8000000.00", direction: "CREDIT", description: "Large contract milestone payment", merchant: "Zaria Wholesalers", date },
      { externalRef: `SAMPLE-${ref}-3`, accountId, amount: "45000.00", direction: "DEBIT", description: "Office cleaning service", merchant: "CleanCo", date },
    ],
    null,
    2,
  );
}

async function importSingle() {
  loading.value = true;
  error.value = "";
  result.value = null;
  try {
    const transaction = await api.importSingle({
      externalRef: single.value.externalRef,
      accountId: single.value.accountId,
      amount: single.value.amount,
      direction: single.value.direction,
      description: single.value.description,
      merchant: single.value.merchant || undefined,
      date: single.value.date,
    });
    result.value = { imported: [{ index: 0, transaction }], duplicates: [], failed: [] };
    emit("imported");
    emit("close");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

async function importBatch() {
  loading.value = true;
  error.value = "";
  result.value = null;
  try {
    const parsed = JSON.parse(batchText.value) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Batch must be a JSON array of transaction objects");
    }
    result.value = await api.importBatch(parsed);
    emit("imported");
    if (result.value.failed.length === 0) {
      emit("close");
    }
  } catch (e) {
    error.value = e instanceof SyntaxError ? "Invalid JSON" : (e as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  accounts.value = await api.getAccounts();
  if (accounts.value[0]) {
    single.value.accountId = accounts.value[0].id;
  }
});
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal">
      <header class="modal-head">
        <h3>Import transactions</h3>
        <button class="ghost" @click="emit('close')">Close</button>
      </header>

      <div class="tabs">
        <button :class="{ active: mode === 'batch' }" @click="mode = 'batch'">Batch</button>
        <button :class="{ active: mode === 'single' }" @click="mode = 'single'">Single</button>
      </div>

      <div v-if="mode === 'single'" class="import-form">
        <label>
          Account
          <select v-model="single.accountId">
            <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </label>
        <label>External reference <input v-model="single.externalRef" placeholder="INV-1042" /></label>
        <label>Amount (NGN) <input v-model="single.amount" placeholder="12999.75" /></label>
        <label>
          Direction
          <select v-model="single.direction">
            <option>CREDIT</option>
            <option>DEBIT</option>
          </select>
        </label>
        <label>Description <input v-model="single.description" /></label>
        <label>Merchant <input v-model="single.merchant" /></label>
        <button
          class="primary"
          :disabled="loading || !single.accountId || !single.externalRef || !single.amount || !single.description"
          @click="importSingle"
        >
          {{ loading ? "Importing..." : "Import transaction" }}
        </button>
      </div>

      <div v-else class="import-form">
        <p class="muted">Paste a JSON array of transactions, or load a sample.</p>
        <textarea
          v-model="batchText"
          rows="10"
          placeholder='[{"externalRef":"...","accountId":"...","amount":"...","direction":"DEBIT","description":"...","date":"..."}]'
        ></textarea>
        <div class="row">
          <button class="ghost" @click="loadSample">Load sample</button>
          <button class="primary" :disabled="loading || !batchText" @click="importBatch">
            {{ loading ? "Importing..." : "Import batch" }}
          </button>
        </div>
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <div v-if="result" class="import-result">
        <p>
          Imported: {{ result.imported.length }} · Duplicates: {{ result.duplicates.length }} ·
          Failed: {{ result.failed.length }}
        </p>
        <ul v-if="result.failed.length">
          <li v-for="f in result.failed" :key="f.index" class="error">Row {{ f.index + 1 }}: {{ f.reason }}</li>
        </ul>
        <p class="muted">Imported rows start as PENDING_CATEGORIZATION; the background worker assigns categories shortly.</p>
      </div>
    </div>
  </div>
</template>
