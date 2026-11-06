// Id que nem é UUID dá erro do Postgres na consulta; quem chama responde como "não encontrado".
export const ehUuid = (s: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
