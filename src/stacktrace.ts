import { createStackParser, UNKNOWN_FUNCTION } from '@sentry/core';
import type { StackFrame } from '@sentry/core';

/**
 * 匹配 V8 风格的堆栈帧（微信/支付宝/字节等大部分小程序平台）
 * 格式示例：
 *   at functionName (filename:line:col)
 *   at filename:line:col
 *   at functionName (app-service.js:123:45)
 *   at Object.handleTap (pages/index/index.js:42:13)
 */
const V8_STACK_LINE_REGEX = /^\s*at\s+(?:(.+?)\s+\()?([^\s():]+):(\d+):(\d+)\)?$/;

/**
 * 匹配 Safari/JavaScriptCore 风格的堆栈帧（iOS WebView 环境）
 * 格式示例：
 *   functionName@filename:line:col
 *   @filename:line:col
 */
const SAFARI_STACK_LINE_REGEX = /^\s*(?:([^@]*)@)?([^\s@:]+(?:\.[a-z]+)+):(\d+)(?::(\d+))?\s*$/;

/**
 * 匹配简化格式的堆栈帧（部分平台的简化输出）
 * 格式示例：
 *   filename:line:col
 *   pages/index/index.js:42:13
 */
const SIMPLE_STACK_LINE_REGEX =
  /^\s*((?:pages|utils|components|subpackages|app-service|appservice)\/[^\s:]+):(\d+):(\d+)\s*$/;

function parseIntSafe(value: string | undefined): number {
  if (!value) return 0;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * V8 风格堆栈解析器
 */
function v8StackLineParser(line: string): StackFrame | undefined {
  const match = V8_STACK_LINE_REGEX.exec(line);
  if (!match) {
    return undefined;
  }

  const [, functionName, filename, linenoStr, colnoStr] = match;
  const frame: StackFrame = {
    filename: filename || '<anonymous>',
    function: functionName || UNKNOWN_FUNCTION,
    in_app: isInApp(filename),
  };
  const lineno = parseIntSafe(linenoStr);
  const colno = parseIntSafe(colnoStr);
  if (lineno) frame.lineno = lineno;
  if (colno) frame.colno = colno;
  return frame;
}

/**
 * Safari/JavaScriptCore 风格堆栈解析器
 */
function safariStackLineParser(line: string): StackFrame | undefined {
  const match = SAFARI_STACK_LINE_REGEX.exec(line);
  if (!match) {
    return undefined;
  }

  const [, functionName, filename, linenoStr, colnoStr] = match;
  const frame: StackFrame = {
    filename: filename || '<anonymous>',
    function: functionName || UNKNOWN_FUNCTION,
    in_app: isInApp(filename),
  };
  const lineno = parseIntSafe(linenoStr);
  const colno = parseIntSafe(colnoStr);
  if (lineno) frame.lineno = lineno;
  if (colno) frame.colno = colno;
  return frame;
}

/**
 * 简化格式堆栈解析器
 */
function simpleStackLineParser(line: string): StackFrame | undefined {
  const match = SIMPLE_STACK_LINE_REGEX.exec(line);
  if (!match) {
    return undefined;
  }

  const [, filename, linenoStr, colnoStr] = match;
  const frame: StackFrame = {
    filename: filename || '<anonymous>',
    function: UNKNOWN_FUNCTION,
    in_app: isInApp(filename),
  };
  const lineno = parseIntSafe(linenoStr);
  const colno = parseIntSafe(colnoStr);
  if (lineno) frame.lineno = lineno;
  if (colno) frame.colno = colno;
  return frame;
}

/**
 * 判断堆栈帧是否为应用代码（非框架/SDK 代码）
 */
function isInApp(filename: string | undefined): boolean {
  if (!filename) {
    return true;
  }
  if (
    filename.includes('sentry-miniapp') ||
    filename.includes('@sentry') ||
    filename.includes('WAService') ||
    filename.includes('WASubContext') ||
    filename.includes('aframeworkx') ||
    filename.includes('__dev__')
  ) {
    return false;
  }
  return true;
}

/**
 * 小程序堆栈解析器
 *
 * 支持多平台堆栈格式：
 * - V8 风格（微信/支付宝/字节跳动/百度/QQ/快手/钉钉）
 * - Safari/JavaScriptCore 风格（iOS WebView）
 * - 简化格式（部分平台的精简输出）
 */
export const miniappStackParser = createStackParser(
  [90, v8StackLineParser],
  [80, safariStackLineParser],
  [70, simpleStackLineParser],
);
