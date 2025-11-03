# Metas de Performance

Este documento define metas de desempenho para o jogo **Desafio da Prevenção de Perdas**. Monitore regularmente para garantir que a experiência do usuário permaneça fluida, especialmente em conexões móveis.

## Objetivos

- **Time to Interactive (TTI)**: O aplicativo deve ficar interativo em **menos de 2,5 s** em condições de rede 4G (150 ms de latência, 1,6 Mbps de download).
- **Bundle Total**: O tamanho total dos arquivos transferidos (HTML, CSS, JS e assets) deve ser **inferior a 300 KB** (excluindo as SDKs do Firebase, carregadas externamente).
- **FPS (Frames por segundo)**: Animações (como confetes) devem manter taxa de quadros acima de 30 fps em dispositivos de gama média.
- **Uso de Memória**: O consumo de memória no navegador deve permanecer estável (evitar vazamentos no uso de timers e listeners). Após o fim da partida, timers devem ser limpos.
- **Consumo de CPU**: Em situações de jogo com 4 jogadores, o uso de CPU não deve provocar travamentos perceptíveis.

## Recomendações de Teste

1. Use ferramentas como **Lighthouse**, **PageSpeed Insights** ou **WebPageTest** para medir TTI e tamanho de bundle.
2. Simule condições de rede com throttling no DevTools (4G lento) e verifique se o app permanece responsivo.
3. Execute a aplicação em dispositivos reais (smartphones e notebooks) para observar fluidez das animações.
4. Monitore o console do navegador em busca de mensagens de erro ou advertências que indiquem problemas de performance.
5. Verifique se **event listeners** são removidos após uso e se timers são cancelados ao mudar de tela.
