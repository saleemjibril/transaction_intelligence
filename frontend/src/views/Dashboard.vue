<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api";
import { categoryLabel, formatNGN } from "../format";
import type { DashboardSummary } from "../types";

const summary = ref<DashboardSummary | null>(null);
const error = ref("");

async function load() {
  error.value = "";
  try {
    summary.value = await api.getDashboard();
  } catch (e) {
    error.value = (e as Error).message;
  }
}

function maxSpend(): number {
  if (!summary.value) return 1;
  return Math.max(1, ...summary.value.spendingByCategory.map((s) => Number(s.total)));
}

onMounted(load);
</script>

<template>
  <div>
    <h2>Dashboard</h2>
    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="summary" class="kpis">
      <div class="kpi">
        <span class="kpi-label">Total inflows</span>
        <span class="kpi-value">{{ formatNGN(summary.totalInflows) }}</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">Total outflows</span>
        <span class="kpi-value">{{ formatNGN(summary.totalOutflows) }}</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">Net cash flow</span>
        <span class="kpi-value">{{ formatNGN(summary.netCashFlow) }}</span>
      </div>
      <div class="kpi kpi-warn">
        <span class="kpi-label">Flagged</span>
        <span class="kpi-value">{{ summary.flaggedCount }}</span>
      </div>
    </div>

    <div v-if="summary" class="panel">
      <h3>Spending by category</h3>
      <p v-if="summary.spendingByCategory.length === 0" class="muted">No spending recorded.</p>
      <div v-for="row in summary.spendingByCategory" :key="row.category" class="bar-row">
        <span class="bar-label">{{ categoryLabel(row.category) }}</span>
        <div class="bar-track">
          <div class="bar-fill" :style="{ width: `${(Number(row.total) / maxSpend()) * 100}%` }"></div>
        </div>
        <span class="bar-value">{{ formatNGN(row.total) }}</span>
      </div>
    </div>
  </div>
</template>
