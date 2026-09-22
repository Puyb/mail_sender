<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/authStore';

const email = ref('');
const password = ref('');
const error = ref<string | null>(null);
const loading = ref(false);

const authStore = useAuthStore();
const router = useRouter();

async function handleSubmit() {
  error.value = null;
  loading.value = true;
  try {
    await authStore.login(email.value, password.value);
    router.push({ name: 'drafts' });
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <article style="max-width: 420px; margin: 4rem auto">
    <h1>Connexion</h1>
    <form @submit.prevent="handleSubmit">
      <label>
        Email
        <input v-model="email" type="email" required autocomplete="username" />
      </label>
      <label>
        Mot de passe
        <input v-model="password" type="password" required autocomplete="current-password" />
      </label>
      <p v-if="error" style="color: #c62828">{{ error }}</p>
      <button type="submit" :aria-busy="loading">Se connecter</button>
    </form>
  </article>
</template>
