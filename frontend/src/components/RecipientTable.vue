<script setup lang="ts">
import type { Recipient, RecipientWarning } from '../types';

defineProps<{
  recipients: Recipient[];
  warnings: RecipientWarning[];
}>();
</script>

<template>
  <div>
    <p><strong>{{ recipients.length }}</strong> destinataire(s) valide(s)</p>
    <details v-if="warnings.length">
      <summary>{{ warnings.length }} ligne(s) ignorée(s)</summary>
      <ul>
        <li v-for="(w, i) in warnings" :key="i">Ligne {{ w.line }} : {{ w.reason }} <code v-if="w.raw">({{ w.raw }})</code></li>
      </ul>
    </details>
    <table v-if="recipients.length">
      <thead>
        <tr><th>Email</th><th>Prénom</th><th>Nom</th></tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in recipients.slice(0, 50)" :key="i">
          <td>{{ r.email }}</td>
          <td>{{ r.firstName ?? '' }}</td>
          <td>{{ r.lastName ?? '' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="recipients.length > 50"><em>… et {{ recipients.length - 50 }} de plus</em></p>
  </div>
</template>
