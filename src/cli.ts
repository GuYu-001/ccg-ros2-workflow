#!/usr/bin/env node
import cac from 'cac'
import { setupCommands } from './cli-setup'

async function main(): Promise<void> {
  const cli = cac('ccg-ros2-workflow')
  await setupCommands(cli)
  cli.parse(process.argv, { run: false })
  await cli.runMatchedCommand()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
