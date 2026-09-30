import { readFile } from 'node:fs/promises'
import { decodeCode, encodeCode } from './host/codec.mjs'

const [, , command, input] = process.argv

if (command === 'encode') {
  if (!input) throw new Error('usage: node src/cli.mjs encode <plugins.json>')
  const entries = JSON.parse(await readFile(input, 'utf8'))
  const code = encodeCode(entries)
  process.stdout.write(`${code}\n`)
} else if (command === 'decode') {
  if (!input) throw new Error('usage: node src/cli.mjs decode <D1 code>')
  const result = decodeCode(input)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ok) process.exitCode = 1
} else {
  throw new Error('usage: node src/cli.mjs <encode|decode> <file-or-code>')
}

