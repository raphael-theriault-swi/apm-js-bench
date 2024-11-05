import { fork } from "node:child_process"
import { dirname } from "node:path"
import { setInterval } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { metrics, ValueType } from "@opentelemetry/api"

import module from "../package.json" with { type: "json" }
const meter = metrics.getMeter(module.name, module.version)

const latency = meter.createHistogram("response.latency", {
  valueType: ValueType.DOUBLE,
  unit: "ms",
})
const cpu = {
  user: meter.createHistogram("process.cpu.user", {
    valueType: ValueType.DOUBLE,
    unit: "μs",
  }),
  system: meter.createHistogram("process.cpu.system", {
    valueType: ValueType.DOUBLE,
    unit: "μs",
  }),
}
const memory = {
  rss: meter.createGauge("process.memory.rss", {
    valueType: ValueType.INT,
    unit: "b",
  }),
}

const bench = new URL("./bench.js", import.meta.url)
const benches = [
  { instrumented: "none", port: 8080, argv: [], env: {} },
  {
    instrumented: "js",
    port: 8181,
    argv: ["--import=solarwinds-apm"],
    env: {},
  },
  {
    instrumented: "legacy",
    port: 8282,
    argv: ["--import=solarwinds-apm"],
    env: { SW_APM_LEGACY: String(true) },
  },
]

for (const { port, argv, env } of benches) {
  const { SW_APM_SERVICE_KEY, SW_APM_COLLECTOR } = process.env
  fork(bench, {
    execArgv: argv,
    env: { PORT: String(port), SW_APM_SERVICE_KEY, SW_APM_COLLECTOR, ...env },
    cwd: dirname(fileURLToPath(import.meta.url)),
  })
}

const interval = 10 * 1000
for await (const _ of setInterval(interval)) {
  const tasks = benches.map(async ({ port, instrumented }) => {
    const start = performance.now()
    const response = await fetch(`http://localhost:${port}`)
    const data = await response.json()
    latency.record(performance.now() - start, { instrumented })

    cpu.user.record(data.cpu.user, { instrumented })
    cpu.system.record(data.cpu.system, { instrumented })
    memory.rss.record(data.memory.rss, { instrumented })
  })

  try {
    await Promise.allSettled(tasks)
  } catch (errors) {
    for (const error of errors.filter((error) => !!error)) {
      console.error(error)
    }
  }
}
