import path from 'node:path'
import os from 'node:os'

// Onde o agente guarda o que precisa sobreviver entre execuções: os perfis de
// navegador de cada grupo e o registro de maquininhas (terminais.json).
export const BASE_COLETOR = path.join(process.env.LOCALAPPDATA || os.homedir(), 'mova-coletor')
