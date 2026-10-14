import { Logger } from '@nestjs/common';

// Services log every cron iteration and every handled error. Keep the test
// output readable; individual tests can still assert on `Logger.prototype`.
beforeEach(() => {
  for (const method of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
    jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined);
  }
});
