# Checklist de Testes Manuais

Este documento descreve cenários de teste manuais recomendados para garantir que todas as funcionalidades do jogo de quiz estejam funcionando conforme especificado. Execute os testes em diferentes navegadores e dispositivos, sempre considerando a acessibilidade.

## Jogabilidade e Fluxo

1. **Criar Sala**: Verifique se o host consegue criar uma sala e visualizar o código e o QR Code.
2. **Ingressar na Sala**: Teste entrada de 1 a 3 jogadores adicionais informando nome e unidade válidos.
3. **Capacidade Máxima**: Tente ingressar um quinto jogador e confirme que o acesso é bloqueado ou informado.
4. **Configurar Perguntas**: Ajuste o número de perguntas (10, 15, 20) e confirme que a partida usa a quantidade correta.
5. **Início do Jogo**: O host inicia e todos os jogadores recebem a primeira pergunta simultaneamente.
6. **Tempo de Pergunta**: A contagem regressiva de 15 s aparece, bloqueando opções após expirar.
7. **Pontuação**: Acertos adicionam 10 pontos; erros não somam. O desempate ocorre pelo menor tempo total.
8. **Explicação**: Após cada resposta, a explicação da pergunta é exibida por 3 s.
9. **Ranking**: Ao final, verifique se o ranking está ordenado por pontuação e tempo conforme esperado.
10. **Revanche/Nova Sala**: Teste os botões de revanche (recarrega a página) e nova sala (retorna ao lobby).

## Conectividade e Sincronização

11. **Reconexão**: Recarregue a página durante uma partida; o jogador deve retornar à sala e manter seus dados.
12. **Latência**: Responda de dispositivos diferentes e verifique se os dados sincronizam rapidamente.
13. **Desconexão do Host**: Caso o host feche o navegador, a sala deve permanecer acessível até o fim da partida.

## Relatórios e Dados

14. **Exportar CSV**: Clique no botão “Exportar Resultados (CSV)” e abra o arquivo para conferir o conteúdo e colunas.
15. **Dados Persistentes**: Inicie e finalize várias partidas; verifique no banco se as salas e estatísticas foram gravadas corretamente (se configurado).

## Acessibilidade

16. **Navegação por Teclado**: Acesse todas as funções usando apenas o teclado (Tab, Enter, Espaço). O foco deve ser visível.
17. **Leitor de Tela**: Use um leitor de tela (como NVDA ou VoiceOver) e verifique se os elementos são lidos de forma correta (ARIA).
18. **Contraste de Cores**: Utilize ferramentas como o Wave ou Lighthouse para garantir contraste AA mínimo.

## Mobile e Responsividade

19. **Smartphone**: Jogue em um smartphone em modo vertical. Os elementos devem se adaptar sem sobreposições.
20. **Tablet**: Execute em tablet ou janela de largura mediana para conferir o comportamento em telas intermediárias.

Marque cada item como **ok** ou **falha** após a execução e registre observações para correções futuras.
