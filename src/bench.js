import { createServer } from "node:http"
import { cpuUsage, memoryUsage } from "node:process"

let previous = cpuUsage()
const server = createServer((req, res) => {
  const cpu = cpuUsage()
  const memory = memoryUsage.rss()

  res.end(
    JSON.stringify({
      cpu: {
        user: cpu.user - previous.user,
        system: cpu.system - previous.system,
      },
      memory: {
        rss: memory,
      },
    }),
  )
  previous = cpu
})
server.listen(Number(process.env.PORT))
