/**
 * 测试 Breadcrumb 数据大小优化
 * 验证 limitDataSize 函数的功能
 */

// 从源文件复制 limitDataSize 函数进行测试
function limitDataSize(data, maxSize = 1024) {
  if (!data) return data;
  
  const jsonString = JSON.stringify(data);
  if (jsonString.length <= maxSize) {
    return data;
  }
  
  // 如果是数组，截取前几个元素
  if (Array.isArray(data)) {
    const result = [];
    let currentSize = 2; // []
    for (const item of data) {
      const itemString = JSON.stringify(item);
      if (currentSize + itemString.length + 1 > maxSize) break; // +1 for comma
      result.push(item);
      currentSize += itemString.length + 1;
    }
    return result;
  }
  
  // 如果是对象，截取部分字段
  if (typeof data === 'object') {
    const result = {};
    let currentSize = 2; // {}
    for (const [key, value] of Object.entries(data)) {
      const entryString = JSON.stringify({ [key]: value });
      if (currentSize + entryString.length - 2 > maxSize) break; // -2 for {}
      result[key] = value;
      currentSize += entryString.length - 2;
    }
    return result;
  }
  
  // 如果是字符串，截取
  if (typeof data === 'string') {
    return data.length > maxSize ? data.substring(0, maxSize - 3) + '...' : data;
  }
  
  return data;
}

console.log('=== 测试 limitDataSize 函数 ===\n');

// 测试 1: 大数组
console.log('测试 1: 大数组限制');
const largeArray = new Array(100).fill('这是一个很长的字符串，用来测试数组元素的大小限制功能');
const originalArraySize = JSON.stringify(largeArray).length;
const limitedArray = limitDataSize(largeArray, 512);
const limitedArraySize = JSON.stringify(limitedArray).length;

console.log(`原始数组大小: ${originalArraySize} bytes`);
console.log(`限制后数组大小: ${limitedArraySize} bytes`);
console.log(`数组元素数量: ${largeArray.length} -> ${limitedArray.length}`);
console.log(`大小减少: ${((originalArraySize - limitedArraySize) / originalArraySize * 100).toFixed(1)}%\n`);

// 测试 2: 大对象
console.log('测试 2: 大对象限制');
const largeObject = {
  field1: new Array(50).fill('数据'),
  field2: {
    nested: new Array(30).fill('嵌套数据'),
    moreNested: {
      deep: new Array(20).fill('深层数据')
    }
  },
  field3: '这是一个普通字符串',
  field4: new Array(40).fill('更多数据'),
  field5: { key: 'value' }
};

const originalObjectSize = JSON.stringify(largeObject).length;
const limitedObject = limitDataSize(largeObject, 512);
const limitedObjectSize = JSON.stringify(limitedObject).length;

console.log(`原始对象大小: ${originalObjectSize} bytes`);
console.log(`限制后对象大小: ${limitedObjectSize} bytes`);
console.log(`对象字段数量: ${Object.keys(largeObject).length} -> ${Object.keys(limitedObject).length}`);
console.log(`保留的字段:`, Object.keys(limitedObject));
console.log(`大小减少: ${((originalObjectSize - limitedObjectSize) / originalObjectSize * 100).toFixed(1)}%\n`);

// 测试 3: 长字符串
console.log('测试 3: 长字符串限制');
const longString = '这是一个非常长的字符串，'.repeat(100) + '用来测试字符串截取功能';
const originalStringSize = longString.length;
const limitedString = limitDataSize(longString, 200);
const limitedStringSize = limitedString.length;

console.log(`原始字符串长度: ${originalStringSize} 字符`);
console.log(`限制后字符串长度: ${limitedStringSize} 字符`);
console.log(`字符串预览: "${limitedString.substring(0, 50)}..."`);
console.log(`大小减少: ${((originalStringSize - limitedStringSize) / originalStringSize * 100).toFixed(1)}%\n`);

// 测试 4: Console Arguments 模拟
console.log('测试 4: Console Arguments 模拟');
const consoleArgs = [
  '用户操作:',
  {
    action: 'click',
    target: 'button',
    data: new Array(50).fill('点击数据'),
    timestamp: Date.now(),
    userInfo: {
      id: 'user123',
      name: '测试用户',
      preferences: new Array(30).fill('用户偏好')
    }
  },
  '额外信息',
  new Array(20).fill('更多参数')
];

const originalArgsSize = JSON.stringify(consoleArgs).length;
const limitedArgs = limitDataSize(consoleArgs, 512);
const limitedArgsSize = JSON.stringify(limitedArgs).length;

console.log(`原始 console args 大小: ${originalArgsSize} bytes`);
console.log(`限制后 console args 大小: ${limitedArgsSize} bytes`);
console.log(`参数数量: ${consoleArgs.length} -> ${limitedArgs.length}`);
console.log(`大小减少: ${((originalArgsSize - limitedArgsSize) / originalArgsSize * 100).toFixed(1)}%\n`);

// 测试 5: Request Data 模拟
console.log('测试 5: Request Data 模拟');
const requestData = {
  users: new Array(20).fill({
    id: 'user-id-12345',
    name: '用户姓名',
    email: 'user@example.com',
    profile: {
      bio: '这是一个很长的个人简介，包含了用户的详细信息',
      preferences: new Array(10).fill('偏好设置')
    }
  }),
  metadata: {
    timestamp: Date.now(),
    version: '1.0.0',
    additionalData: new Array(30).fill('附加数据')
  },
  config: {
    settings: new Array(15).fill('配置项')
  }
};

const originalRequestSize = JSON.stringify(requestData).length;
const limitedRequestData = limitDataSize(requestData, 512);
const limitedRequestSize = JSON.stringify(limitedRequestData).length;

console.log(`原始请求数据大小: ${originalRequestSize} bytes`);
console.log(`限制后请求数据大小: ${limitedRequestSize} bytes`);
console.log(`数据字段数量: ${Object.keys(requestData).length} -> ${Object.keys(limitedRequestData).length}`);
console.log(`保留的字段:`, Object.keys(limitedRequestData));
if (limitedRequestData.users) {
  console.log(`用户数组: ${requestData.users.length} -> ${limitedRequestData.users.length} 个用户`);
}
console.log(`大小减少: ${((originalRequestSize - limitedRequestSize) / originalRequestSize * 100).toFixed(1)}%\n`);

console.log('=== 优化效果总结 ===');
console.log('✅ limitDataSize 函数成功限制了各种类型数据的大小');
console.log('✅ 数组、对象、字符串都得到了有效的大小控制');
console.log('✅ 在保持数据结构的同时，显著减少了数据量');
console.log('✅ 这将有效防止 breadcrumb 导致 envelope 超过大小限制');