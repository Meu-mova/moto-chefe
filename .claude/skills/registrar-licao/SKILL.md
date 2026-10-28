---
name: registrar-licao
description: Transforma um erro real já corrigido no MOVA em regra escrita no AGENTS.md, para o próximo agente não repetir. Use ao receber a retro de uma issue, ao corrigir um bug que um agente causou, ou quando o Luis pedir "registra isso como lição".
---

# Registrar lição

Uma **lição** é uma regra que nasceu de um erro real neste projeto. Ela mora no `AGENTS.md`, que todo agente lê ao começar, na seção do assunto. O `AGENTS.md` já abre com "Cada regra abaixo nasceu de um incidente real": mantenha isso verdadeiro.

## Passos

1. **Confirme o erro.** Só entra lição de erro que aconteceu e foi corrigido: issue, PR, commit ou print. Achado hipotético não entra. Concluído quando você tiver o número da issue/PR ou o SHA.
2. **Teste se merece regra.** Pergunte: um agente novo, lendo só o `AGENTS.md`, repetiria o erro? Se o tsc, um teste, o CI ou o próprio código já impede, não escreva regra (a trava já é a regra). Se o erro só acontece num caso raro de ferramenta pessoal (shell, editor), guarde na memória do agente, não no `AGENTS.md`. Concluído com a decisão: `AGENTS.md`, memória, ou nada.
3. **Ache a seção.** Procure a seção do assunto no `AGENTS.md` (Banco e migrações, Armadilhas do Drizzle, Datas e fuso, Multi-grupo e permissões, Interface, Fiscal, Teste de banco). Se já houver regra parecida, **edite a existente** em vez de criar outra. Concluído quando a regra tiver um lugar só.
4. **Escreva no formato da casa.** Uma a três linhas, em português simples:
   - o que fazer (a forma positiva, o jeito certo), com o nome real da função, arquivo ou componente;
   - o sintoma que o erro causou, em uma frase;
   - a referência: `(#N)` ou a data.
   Exemplo: "`SelectValue` com função de render: devolva o texto do placeholder quando não houver valor; devolver vazio apaga o placeholder e o campo parece quebrado (#460)."
   Concluído quando a regra couber em até três linhas e citar a referência.
5. **Pode alguma regra velha?** Se a lição torna outra regra inútil ou errada, ajuste ou remova a velha no mesmo PR.
6. **Entregue por PR de docs** para a `dev` (`docs(agents): ...`, `Refs #N`), com o Luis revisando. Agente implementador ou revisor só **propõe** a lição ao Maestro; quem edita o `AGENTS.md` é o Maestro, com o OK do Luis.

## Onde não vai

- Regra de negócio (o que o Cesar decidiu): `CONTEXT.md` ou ADR em `docs/adr/`.
- Passo a passo longo de um assunto: um doc em `docs/` com uma linha no `AGENTS.md` apontando para ele.
