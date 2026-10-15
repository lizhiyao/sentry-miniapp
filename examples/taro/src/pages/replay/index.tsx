import { useState } from 'react';
import { View, Text, Button, Input, ScrollView, CustomWrapper } from '@tarojs/components';

function Card({ name, masked = false }: { name: string; masked?: boolean }) {
  return (
    <View
      className={masked ? 'sentry-mask' : ''}
      style={{ marginBottom: '16px', padding: '16px', background: '#fff', borderRadius: '12px' }}
    >
      <Text>{name}</Text>
      {[1, 2].map((row) => (
        <View key={row}>
          {[1, 2].map((column) => (
            <Text key={column}>
              {name}-{row}-{column}{' '}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export default function ReplayExample() {
  const [updated, setUpdated] = useState(false);
  return (
    <View className="sentry-unmask" style={{ padding: '24px', background: '#f3f5f9' }}>
      <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>页面回放 · Taro</Text>
      <View style={{ margin: '12px 0', color: '#536078' }}>
        正常编译生成标记，无需逐页修改模板。输入与屏蔽区域保留占位。
      </View>
      <Button id="replay-update" onClick={() => setUpdated(!updated)}>
        {updated ? '已更新' : '更新页面'}
      </Button>
      <ScrollView scrollY style={{ height: '300px', marginTop: '16px' }}>
        <Card name="公开卡片 A" />
        <Card name="PRIVATE_MASKED" masked />
        <CustomWrapper className="sentry-mask">
          <Card name="PRIVATE_WRAPPER" />
        </CustomWrapper>
        <CustomWrapper>
          <Card name="独立边界 B" />
        </CustomWrapper>
        <Card name="公开卡片 C" />
      </ScrollView>
      <Input value="PRIVATE_INPUT" placeholder="输入始终隐藏" />
      <View className="sentry-block">
        <Text>PRIVATE_BLOCKED</Text>
      </View>
    </View>
  );
}
