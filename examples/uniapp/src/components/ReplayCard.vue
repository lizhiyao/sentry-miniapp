<script setup>
defineProps({ name: String });
</script>
<template>
  <view class="replay-card">
    <text>{{ name }}</text>
    <view v-for="row in [1, 2]" :key="row">
      <text v-for="column in [1, 2]" :key="column">{{ name }}-{{ row }}-{{ column }} </text>
    </view>
    <view><slot /></view>
  </view>
</template>
<style scoped>
.replay-card { margin-bottom: 16px; padding: 16px; background: white; border-radius: 12px; }
</style>
