import React, { useState } from 'react';
import Icon from '../ui/Icon';

const COMMON_ERRORS = [
  {
    code: '400',
    title: '请求格式错误',
    desc: '通常是模型名写错、Base URL 路径不兼容、采样参数不被该模型支持，或服务商要求的字段格式和 OpenAI 兼容格式不同。',
  },
  {
    code: '401 / 403',
    title: '鉴权失败',
    desc: 'API Key 为空、复制时多了空格、Key 已失效，或账号没有调用该模型/接口的权限。',
  },
  {
    code: '404',
    title: '接口或模型不存在',
    desc: '常见于 Base URL 填到了网页地址而不是 API 地址，或模型名称没有和服务商后台完全一致。',
  },
  {
    code: '429',
    title: '频率或额度限制',
    desc: '请求太快、账号额度不足、并发过高，或服务商正在限流。可开启低速率模式、等待额度恢复，或更换通道。',
  },
  {
    code: '5xx',
    title: '服务端异常',
    desc: '通常是服务商繁忙、网关错误、模型维护或本地部署器崩溃。先等待，再检查服务状态和本地日志。',
  },
  {
    code: '超时',
    title: '网络或模型响应过慢',
    desc: '可能是网络不通、代理异常、本地模型冷启动、上下文太长，或服务商响应时间超过测试阈值。',
  },
];

export default function ModelPing() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-slate-200 bg-white/70 p-3 dark:border-slate-700/50 dark:bg-slate-800/50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="min-w-0">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-cyan-400">常见模型连接问题</h4>
          {!open && (
            <p className="mt-1 text-[10px] leading-relaxed text-slate-600 dark:text-slate-400">
              400、401、429、CORS、超时等问题速查。Ping 测试按钮在每个模型通道卡片里。
            </p>
          )}
        </div>
        <Icon name="chevron" size={14} className={`text-slate-500 dark:text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-3 text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
          <div className="grid gap-2 md:grid-cols-2">
            {COMMON_ERRORS.map((item) => (
              <div key={item.code} className="rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-700/50 dark:bg-slate-900/50">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] text-amber-700 dark:bg-slate-800 dark:text-amber-300">{item.code}</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{item.title}</span>
                </div>
                <p className="text-slate-600 dark:text-slate-400">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-cyan-200 bg-cyan-50 p-3 dark:border-cyan-700/40 dark:bg-cyan-950/20">
            <h5 className="mb-1 text-xs font-semibold text-cyan-700 dark:text-cyan-300">CORS / 跨域问题</h5>
            <p className="text-slate-700 dark:text-slate-300">
              本地版 Easy酒馆Pro 是浏览器直接打开的本地文件。如果 API 服务商不支持跨域，或者本地部署 AI 没有开启跨域，浏览器会拦截请求，界面可能显示 Error/CORS。
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-slate-600 dark:text-slate-400">
              <li>打开服务商的跨域支持，或打开本地模型部署器的跨域支持。</li>
              <li>使用代码等方法，把本地文件部署到本地 HTTP 静态网页后访问。</li>
              <li>使用作者部署在 GitHub Pages 的静态网站，收藏或添加到桌面即可。</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
