# Desafio da Prevenção de Perdas

Este projeto é um jogo de perguntas e respostas (quiz) voltado ao treinamento de fiscais de prevenção de perdas na indústria. Foi desenvolvido com **HTML, CSS e JavaScript puros** (ES Modules) e utiliza o **Firebase Realtime Database** para sincronização em tempo real entre até 4 jogadores. Não há servidor próprio; basta hospedar os arquivos estáticos.

## Como jogar

1. Abra `index.html` em um servidor estático (pode ser `live-server`, `firebase hosting`, `Netlify`, etc.).
2. O **host** clica em **Criar Sala**, define o número de perguntas e compartilha o código ou QR Code com os demais jogadores.
3. Cada jogador acessa o link ou digita o código, informa seu **Nome** e **Unidade** e aguarda no lobby.
4. O host inicia a partida. Cada pergunta tem 15 s e apenas a primeira resposta é considerada. Ao final, a pontuação e o tempo total determinam a classificação.
5. É possível **exportar os resultados** em CSV e iniciar nova partida ou sala.

## Configurando o Firebase

1. Crie um projeto no [Firebase Console](https://console.firebase.google.com/) e habilite:
   - **Authentication → Sign-in method → Anonymous** (ativo);
   - **Realtime Database → Criar banco em modo bloqueado**.
2. Copie o objeto de configuração (`firebaseConfig`) disponível em **Configurações do Projeto → SDKs da Web** e cole em `app.js` na seção indicada.
3. Defina as **Regras de Segurança** para a Realtime Database. Um exemplo básico que restringe leitura e escrita à sala correta é:

   ```json
   {
     "rules": {
       "rooms": {
         "$roomId": {
           ".read": "auth != null && (root.child('rooms/' + $roomId + '/players').hasChild(auth.uid) || root.child('rooms/' + $roomId + '/hostId').val() == auth.uid)",
           ".write": "auth != null && (newData.child('players').child(auth.uid).exists() || root.child('rooms/' + $roomId + '/hostId').val() == auth.uid)",
           ".validate": "newData.hasChildren(['status','createdAt','hostId','settings','questionIndex'])"
         }
       }
     }
   }
   ```
   Essas regras permitem que apenas membros da sala leiam e escrevam dados, e o host tenha permissões adicionais. Ajuste conforme necessidades.
4. (Opcional) Use a função TTL (`.expiration` em Realtime Database ou Firebase Functions) para remover salas inativas.

## Hospedagem estática

O projeto pode ser publicado em qualquer serviço de hospedagem estática. Algumas opções:

### Firebase Hosting

1. Instale a CLI: `npm install -g firebase-tools`.
2. Faça login: `firebase login`.
3. Inicialize: `firebase init hosting` e selecione o projeto criado.
4. Copie os arquivos da pasta `project` para a pasta `public` definida.
5. Execute `firebase deploy`.

### GitHub Pages

1. Crie um repositório e envie os arquivos da pasta `project`.
2. Ative GitHub Pages a partir da branch `main` ou `docs` nas configurações.
3. Acesse o link gerado para jogar.

### Netlify/Vercel

1. Conecte-se com o repositório do projeto.
2. Configure como **site estático** sem comando de build.
3. Defina a pasta raiz como a pasta `project`.

## Atualizando perguntas

As perguntas ficam em `questions.json`. É possível adicionar, editar ou remover itens, desde que respeite a estrutura:

```json
{
  "id": "qXXX",
  "categoria": "...",
  "nivel": "...",
  "pergunta": "...",
  "alternativas": {"A": "...", "B": "...", "C": "...", "D": "..."},
  "correta": "A|B|C|D",
  "explicacao": "..."
}
```

## Política de privacidade

O jogo coleta apenas **nome** e **unidade** informados pelos jogadores, usados exclusivamente para identificação e ranking da partida. Nenhum dado sensível é solicitado ou armazenado. Consulte a política de privacidade da sua organização para personalizar este texto.

## Testes e qualidade

Na pasta `tests` estão disponíveis checklists para verificação manual, performance e acessibilidade. Execute-os ao final do desenvolvimento e durante atualizações para garantir que o produto continue atendendo aos critérios estabelecidos.