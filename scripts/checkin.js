#!/usr/bin/env node
/**
 * WorkBuddy 每日积分签到（自建版）
 *
 * 做三件事：读本机登录态 -> 查今天领没领 -> 没领就领一次。
 *
 * 安全红线：
 *   - accessToken 只在内存里，直接塞进请求头，不打日志、不落盘、不回显
 *   - 只访问 copilot.tencent.com 两个官方路径，不发任何第三方
 *   - 只读本机登录态，不修改 WorkBuddy 本体，不装依赖，不建系统定时任务
 *   - 网络异常只记一次失败，不重试
 *
 * 用法：
 *   node checkin.js            正常签到（没领就领，领过就跳过）
 *   node checkin.js --dry-run  只查状态，绝不真的领（用于首次验证链路）
 *   node checkin.js --json     输出机器可读的一行结果
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const API_ORIGIN = "https://copilot.tencent.com";
const STATUS_PATH = "/v2/billing/meter/checkin-status";
const CHECKIN_PATH = "/v2/billing/meter/daily-checkin";
const TIMEOUT_MS = 15000;
const REL_PATH = ["CodeBuddyExtension", "Data", "Public", "auth", "workbuddy-desktop.info"];

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const AS_JSON = argv.includes("--json");

// ---------------------------------------------------------------- 日志

const LOG_DIR = path.resolve(__dirname, "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "checkin.log");

function log(line) {
  if (!AS_JSON) console.log(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${stripAnsi(line)}\n`, "utf8");
  } catch (e) {
    /* 日志写不进去不影响签到本身 */
  }
}
function stripAnsi(s) {
  return String(s).replace(/\u001b\[[0-9;]*m/g, "");
}

// ---------------------------------------------------------------- 登录态

function authFileCandidates() {
  const home = os.homedir();
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || "";
    const roam = process.env.APPDATA || "";
    // 新版桌面端实际写在 LOCALAPPDATA，APPDATA 仅作回退
    return [path.join(local, ...REL_PATH), path.join(roam, ...REL_PATH)];
  }
  if (process.platform === "darwin") {
    return [path.join(home, "Library", "Application Support", ...REL_PATH)];
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return [path.join(xdg, ...REL_PATH)];
}

function readCredentials() {
  for (const file of authFileCandidates()) {
    if (!file || !fs.existsSync(file)) continue;
    try {
      const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
      const data = JSON.parse(raw);
      const token = data && data.auth && data.auth.accessToken;
      if (typeof token === "string" && token.length > 0) {
        const acct = data.account || {};
        return {
          token,
          uid: acct.uid != null ? String(acct.uid) : "",
          domain: (data.auth && data.auth.domain) != null ? String(data.auth.domain) : "",
          enterpriseId: acct.enterpriseId != null ? String(acct.enterpriseId) : "",
        };
      }
    } catch (e) {
      /* 文件损坏或正在写入，换下一个候选 */
    }
  }
  return null;
}

// ---------------------------------------------------------------- 接口

function buildHeaders(cred) {
  const h = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${cred.token}`,
  };
  if (cred.uid) h["X-User-Id"] = cred.uid;
  if (cred.domain) h["X-Domain"] = cred.domain;
  if (cred.enterpriseId) {
    h["X-Enterprise-Id"] = cred.enterpriseId;
    h["X-Tenant-Id"] = cred.enterpriseId;
  }
  return h;
}

async function post(pathname, cred) {
  const res = await fetch(API_ORIGIN + pathname, {
    method: "POST",
    headers: buildHeaders(cred),
    body: "{}",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch (e) {
    body = null;
  }
  return { status: res.status, body };
}

// ---------------------------------------------------------------- 主流程

function emit(result, message, extra) {
  // 日志无论哪种模式都记，方便定时任务事后排查；token 不进日志
  log(message);
  if (AS_JSON) {
    console.log(JSON.stringify(Object.assign({ result, message }, extra || {})));
  }
  process.exit(result === "OK" || result === "ALREADY" ? 0 : 1);
}

async function main() {
  const cred = readCredentials();
  if (!cred) {
    emit("FAIL", "失败：没读到本机登录态。请确认已安装并登录 WorkBuddy 桌面端（v5.3.8 及以上）。");
    return;
  }

  let statusRes;
  try {
    statusRes = await post(STATUS_PATH, cred);
  } catch (e) {
    emit("FAIL", `失败：网络异常，查不到签到状态（${e && e.message ? e.message : "未知"}）。不重试，等下一次定时。`);
    return;
  }

  if (statusRes.status === 401 || statusRes.status === 403) {
    emit("FAIL", "失败：登录凭证已过期。打开 WorkBuddy 桌面端刷新登录后即可恢复（脚本每次都会重读最新凭证）。");
    return;
  }
  if (statusRes.status !== 200) {
    emit("FAIL", `失败：查询签到状态异常（HTTP ${statusRes.status}）。`);
    return;
  }

  // 这个字段实测不可靠（签完仍可能返回 false），只用来快速短路，
  // 真正的幂等兜底在下面签到接口的 code=10001。
  let already = false;
  try {
    already = Boolean(statusRes.body && statusRes.body.data && statusRes.body.data.today_checked_in);
  } catch (e) {
    already = false;
  }
  if (already) {
    emit("ALREADY", "今日已签到，无需重复领取。");
    return;
  }

  if (DRY_RUN) {
    emit("OK", "试运行：链路正常，凭证有效，今天还没签到（本次不会真领）。");
    return;
  }

  let checkinRes;
  try {
    checkinRes = await post(CHECKIN_PATH, cred);
  } catch (e) {
    emit("FAIL", `失败：网络异常，签到请求没发出去（${e && e.message ? e.message : "未知"}）。不重试，等下一次定时。`);
    return;
  }

  if (checkinRes.status === 401 || checkinRes.status === 403) {
    emit("FAIL", "失败：登录凭证已过期。打开 WorkBuddy 桌面端刷新登录后即可恢复。");
    return;
  }

  const body = checkinRes.body;
  if (!body) {
    emit("FAIL", `失败：签到返回看不懂（HTTP ${checkinRes.status}）。`);
    return;
  }

  // 重复签到时接口返回 HTTP 400 + 业务码 10001，按「今天领过了」处理
  if (body.code === 10001) {
    emit("ALREADY", "今日已签到，无需重复领取（接口确认已领过）。");
    return;
  }
  if (body.code === 0) {
    const d = body.data || {};
    const credit = d.credit != null ? d.credit : "?";
    const streak = d.streak_days != null ? d.streak_days : "?";
    emit("OK", `签到成功：领取 ${credit} 积分，已连续 ${streak} 天。`, { credit, streak });
    return;
  }
  emit("FAIL", `失败：接口返回 code=${body.code}${body.msg ? " " + body.msg : ""}。`);
}

main().catch((e) => {
  emit("FAIL", `失败：脚本异常（${e && e.message ? e.message : "未知"}）。`);
});
