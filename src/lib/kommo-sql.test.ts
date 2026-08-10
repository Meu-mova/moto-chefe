import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PgDialect } from 'drizzle-orm/pg-core'
import { sqlEstadoRespostaLead } from './kommo-sql'

const dialect = new PgDialect()

// O drizzle expande array JS solto numa lista `($1, $2, $3)` — que é um row
// constructor, e `(...)::bigint[]` é SQL inválido. O sync passou 12 dias
// estourando nesse UPDATE sem ninguém ver, porque o erro subia calado.
test('cada array vira UM parâmetro, não uma lista expandida', () => {
  const q = dialect.sqlToQuery(sqlEstadoRespostaLead([1, 2, 3], ['a', 'b', 'c'], ['x', null, null]))

  assert.equal(q.params.length, 3, 'esperado 1 parâmetro por array (3), não um por elemento')
  assert.match(q.sql, /unnest\(\$1::bigint\[\], \$2::text\[\], \$3::text\[\]\)/)
  assert.doesNotMatch(q.sql, /\(\$1, \$2/, 'row constructor quebra o cast para array')
})

test('os arrays chegam inteiros como parâmetro', () => {
  const q = dialect.sqlToQuery(sqlEstadoRespostaLead([7, 8], ['a', 'b'], [null, 'z']))
  assert.deepEqual(q.params, [[7, 8], ['a', 'b'], [null, 'z']])
})
