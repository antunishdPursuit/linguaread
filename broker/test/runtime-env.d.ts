import type { DailyAnalysisAllowance } from '../src/dailyAllowance';

declare global {
  namespace Cloudflare {
    interface Env {
      DAILY_ALLOWANCE: DurableObjectNamespace<DailyAnalysisAllowance>;
    }
  }
}
