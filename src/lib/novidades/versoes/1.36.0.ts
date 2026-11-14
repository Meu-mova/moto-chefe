import type { NovidadeDaVersao } from '../tipos'

const novidade: NovidadeDaVersao = {
  versao: '1.36.0',
  data: '2026-11-13',
  novidades: [
    {
      titulo: 'Novidades do MOVA a cada versão',
      texto: 'Quando o MOVA mudar algo que você usa, esta janela vai mostrar o que mudou, em poucas linhas. Ela aparece uma vez para cada pessoa em cada aparelho: é só ler e clicar em Entendi.',
    },
    {
      titulo: 'Aprovação de venda abaixo do mínimo mais clara',
      texto: 'O pedido de aprovação agora mostra o preço mínimo, o valor da venda e o que sobra depois das taxas do cartão, com quanto cada um ficou abaixo do mínimo.',
    },
    {
      titulo: 'Comprovante de transferência para imprimir',
      texto: 'Cada transferência entre lojas tem o botão Imprimir. O comprovante traz a moto, a loja de origem e a de destino, uma lista para conferir a moto na chegada e espaço para as assinaturas.',
    },
  ],
}

export default novidade
