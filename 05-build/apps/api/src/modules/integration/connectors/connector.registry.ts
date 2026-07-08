import { Injectable, NotImplementedException } from '@nestjs/common';
import { Connector } from './connector';
import { MockConnector } from './mock-connector';

/**
 * Registry connector theo provider. Lát 4b: notion/ms_planner/ms_todo = MOCK
 * (RED-LINE #2 — connector thật chỉ cắm khi có token sandbox từ chủ dự án).
 * Provider chưa hỗ trợ → NotImplemented tường minh (fail-closed, không im lặng).
 */
@Injectable()
export class ConnectorRegistry {
  private connectors = new Map<string, Connector>(
    ['notion', 'ms_planner', 'ms_todo'].map((p) => [p, new MockConnector(p)]),
  );

  resolve(provider: string): Connector {
    const c = this.connectors.get(provider);
    if (!c) {
      throw new NotImplementedException(
        `Connector '${provider}' chưa hỗ trợ đẩy outbound (lát này chỉ mock notion/ms_planner/ms_todo)`,
      );
    }
    return c;
  }

  has(provider: string): boolean {
    return this.connectors.has(provider);
  }
}
