import React from 'react';
import { useModels } from '../../hooks/useModels';
import Button from '../ui/Button';
import Icon from '../ui/Icon';

export default function ModelPing() {
  const { models, pinging, pingModel } = useModels();

  const latencyLabel = (lat: number): { text: string; color: string } => {
    if (lat === -1) return { text: '未测试', color: 'text-slate-500' };
    if (lat === -2) return { text: '超时', color: 'text-red-400' };
    if (lat === -3) return { text: 'Error/CORS', color: 'text-red-400' };
    // HTTP 错误码：编码为 -400 - status，例如 401 → -401，500 → -500
    if (lat <= -400) {
      const status = -400 - lat;
      // 401/403 → 鉴权失败；404 → 路径错误；5xx → 服务端异常；其他 → HTTP 错误
      let label = `HTTP ${status}`;
      if (status === 401 || status === 403) label = `HTTP ${status} 鉴权失败`;
      else if (status === 404) label = `HTTP 404 路径错误`;
      else if (status >= 500) label = `HTTP ${status} 服务端异常`;
      return { text: label, color: 'text-red-400' };
    }
    return { text: `${lat} ms`, color: lat < 500 ? 'text-green-400' : lat < 1500 ? 'text-amber-400' : 'text-red-400' };
  };

  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">延迟测试</h4>
      {models.map((m) => {
        const lat = latencyLabel(m.latency);
        return (
          <div key={m.id} className="flex items-center justify-between py-1">
            <span className="text-xs text-slate-300 truncate flex-1 mr-2">{m.name}</span>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-mono ${lat.color}`}>{lat.text}</span>
              <Button size="sm" variant="ghost" onClick={() => pingModel(m.id)} loading={pinging[m.id]} title="Ping">
                <Icon name="ping" size={12} />
              </Button>
            </div>
          </div>
        );
      })}
      {models.length === 0 && <div className="text-xs text-slate-500">暂无模型</div>}
    </div>
  );
}
