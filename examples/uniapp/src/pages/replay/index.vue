<script setup>
import { ref } from 'vue';
import ReplayCard from '../../components/ReplayCard.vue';
const updated = ref(false);
</script>
<template>
  <view data-sentry-replay-unmask="true" style="padding: 24px; background: #f3f5f9">
    <text style="font-size: 24px; font-weight: bold">页面回放 · uni-app</text>
    <view style="margin: 12px 0; color: #536078">正常编译生成标记，无需逐页修改模板。输入与屏蔽区域保留占位。</view>
    <button id="replay-update" @tap="updated = !updated">{{ updated ? '已更新' : '更新页面' }}</button>
    <scroll-view scroll-y style="height: 300px; margin-top: 16px">
      <ReplayCard name="公开卡片 A"><text>默认插槽 A</text></ReplayCard>
      <ReplayCard name="PRIVATE_MASKED" data-sentry-replay-mask="true"><text>PRIVATE_SLOT</text></ReplayCard>
      <ReplayCard name="公开卡片 C"><text>默认插槽 C</text></ReplayCard>
    </scroll-view>
    <input value="PRIVATE_INPUT" placeholder="输入始终隐藏" />
    <view data-sentry-replay-block="true"><text>PRIVATE_BLOCKED</text></view>
  </view>
</template>
