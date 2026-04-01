<template>
  <div class="space-y-6">
    <!-- Welcome hero -->
    <section class="hero-panel">
      <div class="max-w-2xl">
        <div class="page-kicker">Get Started</div>
        <h1 class="section-title mt-3 text-[1.75rem] sm:text-[2rem]">Welcome to Kong SMS</h1>
        <p class="section-copy mt-3 max-w-xl">
          Set up your first AI campaign in under 5 minutes. Your chatbot will qualify leads and book meetings while you focus on closing.
        </p>
      </div>
    </section>

    <!-- Onboarding checklist -->
    <OnboardingChecklist />

    <!-- What happens next -->
    <section class="panel">
      <div class="page-kicker">How It Works</div>
      <h2 class="section-title mt-3">Three things power your AI chatbot</h2>
      <p class="section-copy mt-2">Complete the setup above, then sit back while your AI handles inbound leads.</p>

      <div class="mt-5 grid gap-4 sm:grid-cols-3">
        <div class="stat-card">
          <div class="stat-label">Campaign</div>
          <div class="mt-2 text-sm font-semibold text-slate-900">Defines the rules</div>
          <div class="stat-meta">Business hours, stop conditions, and which agents handle conversations.</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">AI Agent</div>
          <div class="mt-2 text-sm font-semibold text-slate-900">Handles the conversation</div>
          <div class="stat-meta">Your agent qualifies leads, answers questions, and books meetings via SMS.</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Calendar</div>
          <div class="mt-2 text-sm font-semibold text-slate-900">Books the meeting</div>
          <div class="stat-meta">When a lead is qualified, your AI books directly into your Calendly.</div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import OnboardingChecklist from './OnboardingChecklist.vue';
</script>
